import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Beneficiary from "../models/Beneficiary.js";
import PendingTransfer from "../models/PendingTransfer.js";
import { generateReference } from "../utils/generateIds.js";
import { notifyTransaction } from "../utils/notify.js";
import { checkTransferLimits } from "../utils/transferLimits.js";
import { convertCurrency } from "../utils/exchangeRates.js";
import {
  getEnabledSteps,
  generateStepCode,
  describeStep,
} from "../utils/transferSecuritySteps.js";

const CONVERSION_FEE_RATE = 0.01; // 1%
const CONVERSION_FEE_MIN = 5;
const CONVERSION_FEE_MAX = 50;

// If the sender has no transfer security steps enabled, finalize immediately
// (money moves now). Otherwise, hold the transfer — nothing is debited or
// credited until every enabled step is verified via /verify-step.
const holdOrFinalize = async (res, sender, type, payload, finalizeFn) => {
  const enabledSteps = getEnabledSteps(sender);

  if (enabledSteps.length === 0) {
    const tx = await finalizeFn();
    return res.status(201).json({ message: "Transfer successful", transaction: tx });
  }

  const pending = await PendingTransfer.create({
    user: sender._id,
    type,
    payload,
    steps: enabledSteps,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });

  const firstKey = enabledSteps[0];
  if (sender.transferSecurity[firstKey]?.mode === "generated") {
    pending.generatedCodes = { [firstKey]: generateStepCode() };
    await pending.save();
  }

  return res.status(202).json({
    needsVerification: true,
    pendingTransferId: pending._id,
    step: describeStep(sender, firstKey),
    stepNumber: 1,
    totalSteps: enabledSteps.length,
  });
};

// --- Finalizers: perform the actual balance change + Transaction record.
// Each re-fetches fresh documents and re-checks balance, since time may
// have passed between the initial request and the last verification step. ---

const finalizeInternal = async (senderId, { receiverId, amount, description }) => {
  const sender = await User.findById(senderId);
  const receiver = await User.findById(receiverId);
  if (!receiver) throw new Error("Recipient account no longer exists");

  const isCrossCurrency = receiver.currency !== sender.currency;
  const fee = isCrossCurrency
    ? Math.min(Math.max(amount * CONVERSION_FEE_RATE, CONVERSION_FEE_MIN), CONVERSION_FEE_MAX)
    : 0;
  const totalDebit = amount + fee;
  if (sender.balance < totalDebit) throw new Error("Insufficient balance");

  let convertedAmount = amount;
  let exchangeRate = 1;
  if (isCrossCurrency) {
    convertedAmount = await convertCurrency(amount, sender.currency, receiver.currency);
    exchangeRate = Math.round((convertedAmount / amount) * 1000000) / 1000000;
  }

  sender.balance -= totalDebit;
  receiver.balance += convertedAmount;
  await sender.save();
  await receiver.save();

  const reference = generateReference();
  const tx = await Transaction.create({
    reference,
    type: "transfer_internal",
    sender: sender._id,
    receiver: receiver._id,
    amount,
    currency: sender.currency,
    fee,
    convertedAmount: isCrossCurrency ? convertedAmount : undefined,
    convertedCurrency: isCrossCurrency ? receiver.currency : undefined,
    exchangeRate: isCrossCurrency ? exchangeRate : undefined,
    balanceAfterSender: sender.balance,
    balanceAfterReceiver: receiver.balance,
    description: description || "Internal transfer",
    category: "Transfer",
    status: "completed",
  });

  const date = new Date().toLocaleString("en-US");
  await notifyTransaction(sender, {
    action: "debited", amount: totalDebit, currency: sender.currency,
    balance: sender.balance, reference, date,
  });
  await notifyTransaction(receiver, {
    action: "credited", amount: convertedAmount, currency: receiver.currency,
    balance: receiver.balance, reference, date,
  });

  return { ...tx.toObject(), receiverName: `${receiver.firstName} ${receiver.lastName}` };
};

const finalizeExternal = async (senderId, { bankName, accountName, accountNumber, routingNumber, amount, description }) => {
  const sender = await User.findById(senderId);
  if (sender.balance < amount) throw new Error("Insufficient balance");

  sender.balance -= amount;
  await sender.save();

  const reference = generateReference();
  const tx = await Transaction.create({
    reference,
    type: "transfer_external",
    sender: sender._id,
    externalBankName: bankName,
    externalAccountName: accountName,
    externalAccountNumber: accountNumber,
    externalRoutingNumber: routingNumber,
    amount,
    currency: sender.currency,
    balanceAfterSender: sender.balance,
    description: description || `Transfer to ${accountName}`,
    category: "Transfer",
    status: "completed",
  });

  await notifyTransaction(sender, {
    action: "debited", amount, currency: sender.currency,
    balance: sender.balance, reference, date: new Date().toLocaleString("en-US"),
  });

  return tx;
};

const finalizeInternational = async (senderId, { country, bankName, accountName, swiftCode, iban, bankAddress, amount, description }) => {
  const sender = await User.findById(senderId);
  const fee = Math.min(Math.max(amount * 0.01, 5), 50);
  const totalDebit = amount + fee;
  if (sender.balance < totalDebit) throw new Error("Insufficient balance");

  sender.balance -= totalDebit;
  await sender.save();

  const reference = generateReference();
  const tx = await Transaction.create({
    reference,
    type: "transfer_international",
    sender: sender._id,
    externalCountry: country,
    externalBankName: bankName,
    externalAccountName: accountName,
    externalSwiftCode: swiftCode.toUpperCase(),
    externalIban: iban,
    externalBankAddress: bankAddress,
    amount,
    fee,
    currency: sender.currency,
    balanceAfterSender: sender.balance,
    description: description || `International transfer to ${accountName}`,
    category: "International Transfer",
    status: "completed",
  });

  await notifyTransaction(sender, {
    action: "debited", amount: totalDebit, currency: sender.currency,
    balance: sender.balance, reference, date: new Date().toLocaleString("en-US"),
  });

  return tx;
};

const finalizeP2P = async (senderId, { identifier, amount, description }, method) => {
  const sender = await User.findById(senderId);
  const label = method === "paypal" ? "PayPal" : "Zelle";
  const receiver = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
  });

  const isCrossCurrency = receiver && receiver.currency !== sender.currency;
  const fee = isCrossCurrency
    ? Math.min(Math.max(amount * CONVERSION_FEE_RATE, CONVERSION_FEE_MIN), CONVERSION_FEE_MAX)
    : 0;
  const totalDebit = amount + fee;
  if (sender.balance < totalDebit) throw new Error("Insufficient balance");

  let convertedAmount = amount;
  let exchangeRate = 1;
  if (isCrossCurrency) {
    convertedAmount = await convertCurrency(amount, sender.currency, receiver.currency);
    exchangeRate = Math.round((convertedAmount / amount) * 1000000) / 1000000;
  }

  const reference = generateReference();
  const date = new Date().toLocaleString("en-US");

  sender.balance -= totalDebit;
  await sender.save();
  if (receiver) {
    receiver.balance += convertedAmount;
    await receiver.save();
  }

  const tx = await Transaction.create({
    reference,
    type: method === "paypal" ? "transfer_paypal" : "transfer_zelle",
    sender: sender._id,
    receiver: receiver?._id,
    p2pIdentifier: identifier,
    amount,
    currency: sender.currency,
    fee,
    convertedAmount: isCrossCurrency ? convertedAmount : undefined,
    convertedCurrency: isCrossCurrency ? receiver.currency : undefined,
    exchangeRate: isCrossCurrency ? exchangeRate : undefined,
    balanceAfterSender: sender.balance,
    balanceAfterReceiver: receiver ? receiver.balance : undefined,
    description: description || `${label} transfer to ${identifier}`,
    category: label,
    status: "completed",
  });

  await notifyTransaction(sender, {
    action: "debited", amount: totalDebit, currency: sender.currency,
    balance: sender.balance, reference, date,
  });
  if (receiver) {
    await notifyTransaction(receiver, {
      action: "credited", amount: convertedAmount, currency: receiver.currency,
      balance: receiver.balance, reference, date,
    });
  }

  return tx;
};

const finalizeByType = (type, senderId, payload) => {
  switch (type) {
    case "internal": return finalizeInternal(senderId, payload);
    case "external": return finalizeExternal(senderId, payload);
    case "international": return finalizeInternational(senderId, payload);
    case "zelle": return finalizeP2P(senderId, payload, "zelle");
    case "paypal": return finalizeP2P(senderId, payload, "paypal");
    default: throw new Error("Unknown transfer type");
  }
};

// @route POST /api/transactions/transfer/internal
export const transferInternal = async (req, res) => {
  try {
    const sender = await User.findById(req.user._id).select("+transactionPin");
    const { receiverAccountNumber, amount, pin, description } = req.body;

    if (!receiverAccountNumber || !amount || !pin) {
      return res.status(400).json({ message: "Recipient account, amount, and PIN are required" });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than zero" });
    }
    if (!(await sender.comparePin(pin))) {
      return res.status(400).json({ message: "Incorrect transaction PIN" });
    }

    const receiver = await User.findOne({ accountNumber: receiverAccountNumber });
    if (!receiver) {
      return res.status(404).json({ message: "Recipient account not found" });
    }
    if (receiver._id.equals(sender._id)) {
      return res.status(400).json({ message: "You cannot transfer to your own account" });
    }

    const isCrossCurrency = receiver.currency !== sender.currency;
    const fee = isCrossCurrency
      ? Math.min(Math.max(amount * CONVERSION_FEE_RATE, CONVERSION_FEE_MIN), CONVERSION_FEE_MAX)
      : 0;
    if (sender.balance < amount + fee) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const limitError = await checkTransferLimits(sender, amount);
    if (limitError) return res.status(400).json({ message: limitError });

    const payload = { receiverId: receiver._id.toString(), amount, description };
    return holdOrFinalize(res, sender, "internal", payload, () =>
      finalizeInternal(sender._id, payload),
    );
  } catch (error) {
    console.error("Internal transfer error:", error);
    return res.status(500).json({ message: "Transfer failed" });
  }
};

// @route POST /api/transactions/transfer/external
export const transferExternal = async (req, res) => {
  try {
    const sender = await User.findById(req.user._id).select("+transactionPin");
    const { bankName, accountName, accountNumber, routingNumber, amount, pin, description } = req.body;

    if (!bankName || !accountName || !accountNumber || !routingNumber || !amount || !pin) {
      return res.status(400).json({ message: "All transfer fields and PIN are required" });
    }
    if (!/^\d{9}$/.test(routingNumber)) {
      return res.status(400).json({ message: "Routing number must be exactly 9 digits" });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than zero" });
    }
    if (!(await sender.comparePin(pin))) {
      return res.status(400).json({ message: "Incorrect transaction PIN" });
    }
    if (sender.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const limitError = await checkTransferLimits(sender, amount);
    if (limitError) return res.status(400).json({ message: limitError });

    const payload = { bankName, accountName, accountNumber, routingNumber, amount, description };
    return holdOrFinalize(res, sender, "external", payload, () =>
      finalizeExternal(sender._id, payload),
    );
  } catch (error) {
    console.error("External transfer error:", error);
    return res.status(500).json({ message: "Transfer failed" });
  }
};

// @route POST /api/transactions/transfer/international
export const transferInternational = async (req, res) => {
  try {
    const sender = await User.findById(req.user._id).select("+transactionPin");
    const { country, bankName, accountName, swiftCode, iban, bankAddress, amount, pin, description } = req.body;

    if (!country || !bankName || !accountName || !swiftCode || !iban || !amount || !pin) {
      return res.status(400).json({ message: "All international transfer fields and PIN are required" });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than zero" });
    }
    if (!/^[A-Z0-9]{8,11}$/i.test(swiftCode)) {
      return res.status(400).json({ message: "Please enter a valid SWIFT/BIC code (8-11 characters)" });
    }
    if (!(await sender.comparePin(pin))) {
      return res.status(400).json({ message: "Incorrect transaction PIN" });
    }

    const limitError = await checkTransferLimits(sender, amount);
    if (limitError) return res.status(400).json({ message: limitError });

    const fee = Math.min(Math.max(amount * 0.01, 5), 50);
    if (sender.balance < amount + fee) {
      return res.status(400).json({
        message: `Insufficient balance. This transfer requires ${sender.currency} ${(amount + fee).toFixed(2)} including a ${sender.currency} ${fee.toFixed(2)} international transfer fee.`,
      });
    }

    const payload = { country, bankName, accountName, swiftCode: swiftCode.toUpperCase(), iban, bankAddress, amount, description };
    return holdOrFinalize(res, sender, "international", payload, () =>
      finalizeInternational(sender._id, payload),
    );
  } catch (error) {
    console.error("International transfer error:", error);
    return res.status(500).json({ message: "Transfer failed" });
  }
};

// @route POST /api/transactions/transfer/zelle
// @route POST /api/transactions/transfer/paypal
const transferP2P = async (req, res, method) => {
  try {
    const sender = await User.findById(req.user._id).select("+transactionPin");
    const { identifier, amount, pin, description } = req.body;
    const label = method === "paypal" ? "PayPal" : "Zelle";

    if (!identifier || !amount || !pin) {
      return res.status(400).json({
        message: `Recipient ${method === "paypal" ? "email" : "email or phone number"}, amount, and PIN are required`,
      });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than zero" });
    }
    if (method === "paypal" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }
    if (method === "zelle") {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      const isPhone = /^\+?[\d\s-]{7,15}$/.test(identifier);
      if (!isEmail && !isPhone) {
        return res.status(400).json({ message: "Please enter a valid email address or phone number" });
      }
    }
    if (!(await sender.comparePin(pin))) {
      return res.status(400).json({ message: "Incorrect transaction PIN" });
    }

    const receiver = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }],
    });
    if (receiver && receiver._id.equals(sender._id)) {
      return res.status(400).json({ message: "You cannot send money to yourself" });
    }

    const isCrossCurrency = receiver && receiver.currency !== sender.currency;
    const fee = isCrossCurrency
      ? Math.min(Math.max(amount * CONVERSION_FEE_RATE, CONVERSION_FEE_MIN), CONVERSION_FEE_MAX)
      : 0;
    if (sender.balance < amount + fee) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const limitError = await checkTransferLimits(sender, amount);
    if (limitError) return res.status(400).json({ message: limitError });

    const payload = { identifier, amount, description };
    return holdOrFinalize(res, sender, method, payload, () =>
      finalizeP2P(sender._id, payload, method),
    );
  } catch (error) {
    console.error(`${method} transfer error:`, error);
    return res.status(500).json({ message: "Transfer failed" });
  }
};

export const transferZelle = (req, res) => transferP2P(req, res, "zelle");
export const transferPaypal = (req, res) => transferP2P(req, res, "paypal");

// @route POST /api/transactions/verify-step
// body: { pendingTransferId, code }
export const verifyTransferStep = async (req, res) => {
  try {
    const { pendingTransferId, code } = req.body;
    if (!pendingTransferId || !code) {
      return res.status(400).json({ message: "Code is required" });
    }

    const pending = await PendingTransfer.findOne({
      _id: pendingTransferId,
      user: req.user._id,
    });
    if (!pending) {
      return res.status(404).json({ message: "This transfer request was not found or has expired" });
    }
    if (pending.expiresAt < new Date()) {
      await pending.deleteOne();
      return res.status(400).json({ message: "This transfer request has expired. Please start over." });
    }

    const user = await User.findById(req.user._id);
    const stepKey = pending.steps[pending.currentStepIndex];
    const settings = user.transferSecurity?.[stepKey] || {};
    const expected =
      settings.mode === "generated" ? pending.generatedCodes?.[stepKey] : settings.code;

    const isCorrect =
      expected && code.trim().toLowerCase() === String(expected).trim().toLowerCase();

    if (!isCorrect) {
      pending.attempts += 1;
      if (pending.attempts >= 3) {
        await pending.deleteOne();
        return res.status(400).json({
          message: "Too many incorrect attempts. This transfer has been cancelled.",
          cancelled: true,
        });
      }
      await pending.save();
      return res.status(400).json({
        message: "Incorrect code",
        attemptsRemaining: 3 - pending.attempts,
      });
    }

    const nextIndex = pending.currentStepIndex + 1;
    if (nextIndex < pending.steps.length) {
      pending.currentStepIndex = nextIndex;
      const nextKey = pending.steps[nextIndex];
      if (
        user.transferSecurity[nextKey]?.mode === "generated" &&
        !pending.generatedCodes?.[nextKey]
      ) {
        pending.generatedCodes = {
          ...pending.generatedCodes,
          [nextKey]: generateStepCode(),
        };
      }
      await pending.save();
      return res.json({
        needsVerification: true,
        pendingTransferId: pending._id,
        step: describeStep(user, nextKey),
        stepNumber: nextIndex + 1,
        totalSteps: pending.steps.length,
      });
    }

    // Last step passed — finalize the actual transfer now
    let tx;
    try {
      tx = await finalizeByType(pending.type, req.user._id, pending.payload);
    } catch (err) {
      await pending.deleteOne();
      return res.status(400).json({ message: err.message || "Could not complete transfer" });
    }

    await pending.deleteOne();
    return res.status(201).json({ message: "Transfer successful", transaction: tx });
  } catch (error) {
    console.error("Verify transfer step error:", error);
    return res.status(500).json({ message: "Could not verify code" });
  }
};

// @route DELETE /api/transactions/pending/:id
export const cancelPendingTransfer = async (req, res) => {
  try {
    await PendingTransfer.deleteOne({ _id: req.params.id, user: req.user._id });
    return res.json({ message: "Transfer cancelled" });
  } catch (error) {
    return res.status(500).json({ message: "Could not cancel transfer" });
  }
};

// @route GET /api/transactions/me?page=1&limit=20
export const getMyTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const filter = { $or: [{ sender: req.user._id }, { receiver: req.user._id }] };

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("sender", "firstName lastName accountNumber")
      .populate("receiver", "firstName lastName accountNumber");

    const total = await Transaction.countDocuments(filter);

    return res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch transactions" });
  }
};

// @route GET /api/transactions/:id
export const getTransactionById = async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id)
      .populate("sender", "firstName lastName accountNumber")
      .populate("receiver", "firstName lastName accountNumber");
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    const isParticipant =
      (tx.sender && tx.sender._id.equals(req.user._id)) ||
      (tx.receiver && tx.receiver._id.equals(req.user._id));
    if (!isParticipant && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to view this transaction" });
    }

    return res.json({ transaction: tx });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch transaction" });
  }
};

// --- Beneficiaries ---

export const addBeneficiary = async (req, res) => {
  try {
    const {
      nickname, accountHolderName, accountNumber, bankName, routingNumber,
      isInternational, country, swiftCode, iban, bankAddress,
      street, city, state, zip, benCountry,
    } = req.body;

    const internalUser = await User.findOne({ accountNumber });

    const beneficiary = await Beneficiary.create({
      owner: req.user._id,
      nickname,
      accountHolderName,
      accountNumber,
      bankName,
      routingNumber,
      isInternal: !!internalUser,
      internalUser: internalUser?._id,
      isInternational: !!isInternational,
      country: isInternational ? country : undefined,
      swiftCode: isInternational ? swiftCode : undefined,
      iban: isInternational ? iban : undefined,
      bankAddress: isInternational ? bankAddress : undefined,
      beneficiaryAddress:
        isInternational && (street || city || state || zip || benCountry)
          ? { street, city, state, zip, country: benCountry }
          : undefined,
    });

    return res.status(201).json({ beneficiary });
  } catch (error) {
    return res.status(500).json({ message: "Could not save beneficiary" });
  }
};

export const getBeneficiaries = async (req, res) => {
  try {
    const beneficiaries = await Beneficiary.find({ owner: req.user._id }).sort({
      createdAt: -1,
    });
    return res.json({ beneficiaries });
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch beneficiaries" });
  }
};

export const deleteBeneficiary = async (req, res) => {
  try {
    await Beneficiary.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    return res.json({ message: "Beneficiary removed" });
  } catch (error) {
    return res.status(500).json({ message: "Could not remove beneficiary" });
  }
};
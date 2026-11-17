import mongoose from "mongoose";

const pendingTransferSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["internal", "external", "international", "zelle", "paypal"],
      required: true,
    },
    // Everything needed to actually complete the transfer later.
    // Never includes the transaction PIN — that's already been verified.
    payload: { type: mongoose.Schema.Types.Mixed, required: true },

    steps: [{ type: String }], // enabled step keys, in order
    currentStepIndex: { type: Number, default: 0 },
    generatedCodes: { type: mongoose.Schema.Types.Mixed, default: {} },
    attempts: { type: Number, default: 0 },

    // TTL index — MongoDB deletes this document automatically once expired
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export default mongoose.model("PendingTransfer", pendingTransferSchema);
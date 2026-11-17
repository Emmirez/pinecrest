import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Snowflake,
  Ban,
  PlayCircle,
  Wallet,
  Gauge,
  Pencil,
  Trash2,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import api from "../../api/axios";
import TopBar from "../../components/TopBar";
import AdminTransactionEditModal from "../../components/AdminTransactionEditModal";
import AdminTransactionDeleteModal from "../../components/AdminTransactionDeleteModal";
import AdminEditAddressModal from "../../components/AdminEditAddressModal";
import { useAdminMenu } from "../../components/AdminLayout";

const AdminUserDetail = () => {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [adjustType, setAdjustType] = useState("credit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [limitsForm, setLimitsForm] = useState({
    dailyLimit: "",
    weeklyLimit: "",
    monthlyLimit: "",
    perTransactionLimit: "",
  });
  const [editingTx, setEditingTx] = useState(null);
  const [deletingTx, setDeletingTx] = useState(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [tsForm, setTsForm] = useState(null);
  const [tsMessage, setTsMessage] = useState("");
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const { onMenuClick } = useAdminMenu();

  const load = () => {
    api
      .get(`/admin/users/${id}`)
      .then((res) => {
        setUser(res.data.user);
        setTransactions(res.data.transactions);
        setTsForm(
          res.data.user.transferSecurity || {
            emailCode: { enabled: false, mode: "fixed", code: "" },
            authenticatorCode: { enabled: false, mode: "fixed", code: "" },
            securityAnswer: { enabled: false, mode: "fixed", code: "", question: "" },
            complianceReviewPin: { enabled: false, mode: "fixed", code: "" },
          },
        );
        setLimitsForm({
          dailyLimit: res.data.user.limits?.dailyLimit ?? 500000,
          weeklyLimit: res.data.user.limits?.weeklyLimit ?? 1000000,
          monthlyLimit: res.data.user.limits?.monthlyLimit ?? 5000000,
          perTransactionLimit:
            res.data.user.limits?.perTransactionLimit ?? 250000,
        });
      })
      .finally(() => setLoading(false));
    api
      .get(`/admin/users/${id}/pending-transfers`)
      .then((res) => setPendingTransfers(res.data.pending || []));
  };

  useEffect(() => {
    load();
  }, [id]);

  const STEP_META = [
    { key: "emailCode", label: "Email Code" },
    { key: "authenticatorCode", label: "Authenticator Code" },
    { key: "securityAnswer", label: "Security Answer" },
    { key: "complianceReviewPin", label: "Compliance Review PIN" },
  ];

  const updateTsStep = (key, field, value) =>
    setTsForm((f) => ({ ...f, [key]: { ...f[key], [field]: value } }));

  const saveTransferSecurity = async (e) => {
    e.preventDefault();
    await api.put(`/admin/users/${id}/transfer-security`, tsForm);
    setTsMessage("Transfer security settings saved");
    setTimeout(() => setTsMessage(""), 2500);
  };

  const setStatus = async (status) => {
    await api.put(`/admin/users/${id}/status`, { status });
    setMessage(`Status updated to ${status}`);
    load();
  };

  const approve = async () => {
    await api.put(`/admin/users/${id}/approve`);
    setMessage("User approved");
    load();
  };
  const reject = async () => {
    await api.put(`/admin/users/${id}/reject`, {});
    setMessage("User rejected");
    load();
  };

  const adjust = async (e) => {
    e.preventDefault();
    await api.post(`/admin/users/${id}/adjust`, {
      type: adjustType,
      amount: parseFloat(amount),
      note,
    });
    setAmount("");
    setNote("");
    setMessage(`Balance ${adjustType}ed`);
    load();
  };

  const saveLimits = async (e) => {
    e.preventDefault();
    await api.put(`/admin/users/${id}/limits`, {
      dailyLimit: parseFloat(limitsForm.dailyLimit),
      weeklyLimit: parseFloat(limitsForm.weeklyLimit),
      monthlyLimit: parseFloat(limitsForm.monthlyLimit),
      perTransactionLimit: parseFloat(limitsForm.perTransactionLimit),
    });
    setMessage("Account limits updated");
    load();
  };

  if (loading)
    return <div className="p-8 text-slate-400 text-sm">Loading user...</div>;
  if (!user)
    return <div className="p-8 text-slate-400 text-sm">User not found.</div>;

  return (
    <div>
      <TopBar
        notificationsHref="/admin/notifications"
        onMenuClick={onMenuClick}
        profileHref={null}
      />

      <div className="px-4 md:px-8 space-y-6 pb-6 min-w-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-navy-900">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{user.email}</p>
        </div>

        {message && (
          <div className="bg-emerald-50 text-emerald-600 text-sm rounded-xl px-4 py-3">
            {message}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-5">
          <div className="card p-5">
            <p className="text-xs text-slate-400 mb-1">Account Number</p>
            <p className="font-semibold text-navy-900">{user.accountNumber}</p>
            <p className="text-xs text-slate-400 mt-3 mb-1">Type / Currency</p>
            <p className="font-semibold text-navy-900 capitalize">
              {user.accountType?.replace("_", " ")} · {user.currency}
            </p>
            <p className="text-xs text-slate-400 mt-3 mb-1">Balance</p>
            <p className="font-semibold text-navy-900">
              {user.currency} {user.balance?.toFixed(2)}
            </p>
                      <p className="text-xs text-slate-400 mt-3 mb-1">Status</p>
            <p className="font-semibold text-navy-900 capitalize">
              {user.status}
            </p>
            <p className="text-xs text-slate-400 mt-3 mb-1">Address</p>
            <p className="font-semibold text-navy-900 text-sm leading-snug">
              {user.address
                ? [
                    user.address.street,
                    user.address.city,
                    [user.address.state, user.address.zip]
                      .filter(Boolean)
                      .join(" "),
                    user.address.country,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : "—"}
            </p>
            <button
              type="button"
              onClick={() => setEditingAddress(true)}
              className="mt-3 w-full py-2 rounded-xl text-sm font-medium bg-slate-100 text-navy hover:bg-slate-200 transition flex items-center justify-center gap-1.5"
            >
              <MapPin size={15} /> Edit Address
            </button>
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold text-navy-900 mb-3">
              Account Actions
            </p>
            <div className="flex flex-col gap-2">
              {user.status === "pending" && (
                <>
                  <button
                    onClick={approve}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-2 text-sm font-medium flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={15} /> Approve Account
                  </button>
                  <button
                    onClick={reject}
                    className="bg-red-50 hover:bg-red-100 text-red-500 rounded-xl py-2 text-sm font-medium flex items-center justify-center gap-1.5"
                  >
                    <XCircle size={15} /> Reject Application
                  </button>
                </>
              )}
              {user.status === "active" && (
                <>
                  <button
                    onClick={() => setStatus("suspended")}
                    className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
                  >
                    <Ban size={15} /> Suspend Account
                  </button>
                  <button
                    onClick={() => setStatus("frozen")}
                    className="btn-secondary flex items-center justify-center gap-1.5 text-sm"
                  >
                    <Snowflake size={15} /> Freeze Account
                  </button>
                </>
              )}
              {(user.status === "suspended" || user.status === "frozen") && (
                <button
                  onClick={() => setStatus("active")}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-2 text-sm font-medium flex items-center justify-center gap-1.5"
                >
                  <PlayCircle size={15} /> Reactivate Account
                </button>
              )}
            </div>
          </div>

          <form onSubmit={adjust} className="card p-5">
            <p className="text-sm font-semibold text-navy-900 mb-3 flex items-center gap-2">
              <Wallet size={16} /> Manual Balance Adjustment
            </p>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setAdjustType("credit")}
                className={`flex-1 py-2 rounded-xl text-sm font-medium ${adjustType === "credit" ? "bg-navy text-white" : "bg-slate-100 text-slate-500"}`}
              >
                Credit
              </button>
              <button
                type="button"
                onClick={() => setAdjustType("debit")}
                className={`flex-1 py-2 rounded-xl text-sm font-medium ${adjustType === "debit" ? "bg-navy text-white" : "bg-slate-100 text-slate-500"}`}
              >
                Debit
              </button>
            </div>
            <input
              required
              type="number"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-field mb-2"
            />
            <input
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input-field mb-3"
            />
            <button type="submit" className="btn-gold w-full">
              Apply Adjustment
            </button>
          </form>

          <form onSubmit={saveLimits} className="card p-5">
            <p className="text-sm font-semibold text-navy-900 mb-3 flex items-center gap-2">
              <Gauge size={16} /> Account Limits
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-slate-400">Daily Limit</label>
                <input
                  type="number"
                  value={limitsForm.dailyLimit}
                  onChange={(e) =>
                    setLimitsForm((f) => ({ ...f, dailyLimit: e.target.value }))
                  }
                  className="input-field mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Weekly Limit</label>
                <input
                  type="number"
                  value={limitsForm.weeklyLimit}
                  onChange={(e) =>
                    setLimitsForm((f) => ({
                      ...f,
                      weeklyLimit: e.target.value,
                    }))
                  }
                  className="input-field mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Monthly Limit</label>
                <input
                  type="number"
                  value={limitsForm.monthlyLimit}
                  onChange={(e) =>
                    setLimitsForm((f) => ({
                      ...f,
                      monthlyLimit: e.target.value,
                    }))
                  }
                  className="input-field mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">
                  Per-Transaction Limit
                </label>
                <input
                  type="number"
                  value={limitsForm.perTransactionLimit}
                  onChange={(e) =>
                    setLimitsForm((f) => ({
                      ...f,
                      perTransactionLimit: e.target.value,
                    }))
                  }
                  className="input-field mt-1"
                />
              </div>
            </div>
                       <button type="submit" className="btn-primary w-full">
              Save Limits
            </button>
          </form>
        </div>

        {pendingTransfers.length > 0 && (
          <div className="card p-5 bg-gold-50 border border-gold-100">
            <p className="text-sm font-semibold text-navy-900 mb-3">
              Pending Transfer Verification
            </p>
            {pendingTransfers.map((p) => {
              const currentKey = p.steps[p.currentStepIndex];
              const label =
                STEP_META.find((s) => s.key === currentKey)?.label || currentKey;
              const code = p.generatedCodes?.[currentKey];
              return (
                <div key={p._id} className="text-sm text-navy-900 mb-1.5">
                  {p.type} transfer · waiting on <strong>{label}</strong>
                  {code && (
                    <span className="ml-2 font-mono bg-white px-2 py-0.5 rounded">
                      {code}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tsForm && (
          <form onSubmit={saveTransferSecurity} className="card p-5">
            <p className="text-sm font-semibold text-navy-900 mb-1 flex items-center gap-2">
              <ShieldCheck size={16} /> Transfer Security Steps
            </p>
            <p className="text-xs text-slate-400 mb-4">
              Demo-only extra verification steps, requested in this order
              after the transaction PIN. Not a real compliance requirement.
            </p>
            {tsMessage && (
              <div className="bg-emerald-50 text-emerald-600 text-xs rounded-xl px-3 py-2 mb-3">
                {tsMessage}
              </div>
            )}
            <div className="space-y-4">
              {STEP_META.map(({ key, label }) => (
                <div key={key} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-navy-900">{label}</p>
                    <button
                      type="button"
                      onClick={() => updateTsStep(key, "enabled", !tsForm[key].enabled)}
                      className={`h-5 w-9 rounded-full transition relative shrink-0 ${
                        tsForm[key].enabled ? "bg-emerald-500" : "bg-slate-200"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 bg-white rounded-full transition-all ${
                          tsForm[key].enabled ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  {tsForm[key].enabled && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {["fixed", "generated"].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => updateTsStep(key, "mode", m)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
                              tsForm[key].mode === m
                                ? "bg-navy text-white"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {m === "fixed" ? "Fixed code" : "Generate on request"}
                          </button>
                        ))}
                      </div>
                      {key === "securityAnswer" && (
                        <input
                          placeholder="Question shown to the user"
                          value={tsForm[key].question || ""}
                          onChange={(e) => updateTsStep(key, "question", e.target.value)}
                          className="input-field text-sm"
                        />
                      )}
                      {tsForm[key].mode === "fixed" && (
                        <input
                          placeholder={`Code for ${label}`}
                          value={tsForm[key].code || ""}
                          onChange={(e) => updateTsStep(key, "code", e.target.value)}
                          className="input-field text-sm"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button type="submit" className="btn-primary w-full mt-4">
              Save Transfer Security Settings
            </button>
          </form>
        )}

        <div className="card p-5">
          <p className="text-sm font-semibold text-navy-900 mb-4">
            Recent Transactions
          </p>
          {transactions.length === 0 ? (
            <p className="text-sm text-slate-400">No transactions yet.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {transactions.map((tx) => (
                <div
                  key={tx._id}
                  className="flex justify-between items-center py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-navy-900">
                      {tx.description || tx.category}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(tx.createdAt).toLocaleString("en-US")} ·{" "}
                      {tx.reference}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-navy-900">
                      {tx.currency} {tx.amount?.toFixed(2)}
                    </p>
                    <button
                      onClick={() => setEditingTx(tx)}
                      className="text-navy hover:text-gold-700 transition"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeletingTx(tx)}
                      className="text-slate-400 hover:text-red-500 transition"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

          {editingTx && (
        <AdminTransactionEditModal
          transaction={editingTx}
          contextUserId={id}
          onClose={() => setEditingTx(null)}
          onSaved={() => {
            setEditingTx(null);
            setMessage("Transaction updated");
            load();
          }}
        />
      )}

            {editingAddress && (
        <AdminEditAddressModal
          user={user}
          onClose={() => setEditingAddress(false)}
          onSaved={() => {
            setEditingAddress(false);
            setMessage("Address updated");
            load();
          }}
        />
      )}

      {deletingTx && (
        <AdminTransactionDeleteModal
          transaction={deletingTx}
          onClose={() => setDeletingTx(null)}
          onDeleted={(msg) => {
            setDeletingTx(null);
            setMessage(msg);
            load();
          }}
        />
      )}
    </div>
  );
};

export default AdminUserDetail;

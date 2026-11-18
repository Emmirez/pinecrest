import { useState } from "react";
import { X, ShieldCheck, AlertTriangle } from "lucide-react";
import api from "../api/axios";
import { minDelay } from "../utils/minDelay";
import Spinner from "./Spinner";

const TransferVerificationModal = ({
  pendingTransferId,
  initialStep,
  initialStepNumber,
  initialTotalSteps,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState(initialStep);
  const [stepNumber, setStepNumber] = useState(initialStepNumber);
  const [totalSteps, setTotalSteps] = useState(initialTotalSteps);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
          const { data } = await minDelay(api.post("/transactions/verify-step", {
        pendingTransferId,
        code,
      }));  
      setCode("");
      if (data.needsVerification) {
        setStep(data.step);
        setStepNumber(data.stepNumber);
        setTotalSteps(data.totalSteps);
      } else {
        onComplete(data.transaction);
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.cancelled) {
        onCancel(data.message);
        return;
      }
      setError(
        data?.attemptsRemaining !== undefined
          ? `Incorrect code — ${data.attemptsRemaining} attempt${data.attemptsRemaining === 1 ? "" : "s"} left`
          : data?.message || "Could not verify code",
      );
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await api.delete(`/transactions/pending/${pendingTransferId}`);
    } finally {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy-900/40 backdrop-blur-sm px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold text-navy-900 flex items-center gap-2">
            <ShieldCheck size={17} /> Verify Transfer
          </p>
          <button
            onClick={cancel}
            disabled={cancelling}
            className="text-slate-400 hover:text-navy transition"
          >
            <X size={20} />
          </button>
        </div>
        {/* <p className="text-xs text-slate-400 mb-4">
          Step {stepNumber} of {totalSteps}
        </p> */}

        <form onSubmit={submit} className="space-y-3">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <p className="text-sm font-semibold text-navy-900">{step.label}</p>
          {step.question && (
            <p className="text-sm text-slate-600">{step.question}</p>
          )}

          <input
            required
            autoFocus
            placeholder={`Enter ${step.label}`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="input-field tracking-wide"
          />

          <div className="bg-slate-50 rounded-xl px-4 py-3 text-xs text-slate-500 flex items-start gap-2">
            <AlertTriangle
              size={14}
              className="shrink-0 mt-0.5 text-slate-400"
            />
            This security step is required to complete your transfer. If you
            don't have this code, contact support for assistance.
          </div>

                    <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium bg-navy text-white hover:bg-navy-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            {loading ? "Verifying..." : "Verify & Continue"}
          </button>
                  <button
            type="button"
            onClick={cancel}
            disabled={cancelling}
            className="w-full py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {cancelling && <Spinner />}
            {cancelling ? "Cancelling..." : "Cancel Transfer"}
          </button>  
        </form>
      </div>
    </div>
  );
};

export default TransferVerificationModal;
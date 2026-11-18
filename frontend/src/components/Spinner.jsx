const Spinner = ({ className = "" }) => (
  <span
    className={`inline-block h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin ${className}`}
  />
);

export default Spinner;
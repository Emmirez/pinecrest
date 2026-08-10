const TELEGRAM_USERNAME = "PinecrestBank";

const FloatingWhatsapp = () => {
  return (
    <a
      href={`https://t.me/${TELEGRAM_USERNAME}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-[#229ED9] shadow-lg hover:scale-105 transition-transform flex items-center justify-center group"
      aria-label="Chat with us on Telegram"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8"
        fill="white"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M21.5 3.5 18.3 20c-.24 1.16-.88 1.45-1.78.9l-4.87-3.59-2.35 2.26c-.26.26-.48.48-.98.48l.35-4.97 9.05-8.18c.39-.35-.08-.55-.61-.2L5.93 13.77l-4.8-1.5c-1.04-.33-1.06-1.04.22-1.54L20.1 3.13c.86-.32 1.62.2 1.4.37Z" />
      </svg>

      <span className="absolute right-full mr-3 whitespace-nowrap bg-navy-900 text-white text-xs font-medium px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Chat with us
      </span>
    </a>
  );
};

export default FloatingWhatsapp;
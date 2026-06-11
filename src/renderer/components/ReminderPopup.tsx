type ReminderPopupProps = {
  icon: string;
  title: string;
  body: string;
  onClose?: () => void;
};

export function ReminderPopup({ icon, title, body, onClose }: ReminderPopupProps) {
  function close() {
    if (onClose) {
      onClose();
      return;
    }
    window.close();
  }

  return (
    <section className="reminder-popup-enter m-3 overflow-hidden rounded-lg border border-assistant-line bg-white/95 text-[13px] text-assistant-ink shadow-utility backdrop-blur">
      <header className="border-b border-assistant-line px-4 py-3">
        <h1 className="text-[15px] font-semibold">
          <span className="mr-2">{icon}</span>
          {title}
        </h1>
      </header>
      <div className="space-y-4 px-4 py-4">
        <p>{body}</p>
        <div className="flex justify-end">
          <button
            className="rounded-md bg-assistant-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-95"
            type="button"
            onClick={close}
          >
            知道了
          </button>
        </div>
      </div>
    </section>
  );
}

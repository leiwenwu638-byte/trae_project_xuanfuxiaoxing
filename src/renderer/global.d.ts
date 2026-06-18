declare global {
  interface Window {
    __REMINDER_POPUP_PAYLOAD__?: {
      title: string;
      body: string;
      icon?: string;
      soundSrc?: string | null;
    };
  }
}

export {};

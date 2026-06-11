import type { AssistantApi } from '../shared/types';

declare global {
  interface Window {
    assistant: AssistantApi;
  }
}

export {};

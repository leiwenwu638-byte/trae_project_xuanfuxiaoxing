import { describe, expect, it } from 'vitest';
import { APP_DISPLAY_NAME, APP_USER_MODEL_ID } from './appMetadata';

describe('app metadata', () => {
  it('uses the Xuanfu Xiaoxing display name', () => {
    expect(APP_DISPLAY_NAME).toBe('悬浮小醒');
  });

  it('uses one stable Windows app identity for taskbar grouping', () => {
    expect(APP_USER_MODEL_ID).toBe('com.xuanfu.xiaoxing');
  });
});

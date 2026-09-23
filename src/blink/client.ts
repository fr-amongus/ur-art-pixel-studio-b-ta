import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'ur-art-pixel-i0un0ytx',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_oyPJSbeThRoC9gQk2alTnSyJjykagFLb',
  authRequired: false,
  auth: { mode: 'managed' },
})

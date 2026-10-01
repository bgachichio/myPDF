// SPDX-License-Identifier: AGPL-3.0-or-later
// R15: a production build fails when either Bitcoin receiving address is empty (CLAUDE.md hard rule).
export function assertSupportConfig(lightning: string, btc: string): void {
  if (!lightning.trim() || !btc.trim()) throw new Error('support.ts: LIGHTNING_ADDRESS and BTC_ADDRESS must not be empty')
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// House sign-off and support details: builder.md §6.1, PRODUCT-SPEC F15 and R15. Public receiving identifiers, not secrets.
// Copy rule: no wording that suggests a gift size.
// The only place these values may appear in source.

export const SIGN_OFF = { text: 'Made with ❤️ by', name: 'Brian Gachichio', url: 'https://x.com/b_gachichio' } as const;

export const PAYSTACK_URL = 'https://paystack.shop/pay/gachichio';

/** Lightning address (Wallet of Satoshi). Shown first. Subtitle: "Instant, near-zero fees". */
export const LIGHTNING_ADDRESS = 'gachichio@walletofsatoshi.com';

/** On-chain Taproot address (Wallet of Satoshi). Subtitle: "Taproot address, any Bitcoin wallet". bech32m checksum verified 30-09-2026. */
export const BTC_ADDRESS = 'bc1ptrd8ykgu046nkwjml4kvtke0vz6ga0cmhccmgkpspwuswrasjspqq6yfu6';

export const lightningUri = (address: string = LIGHTNING_ADDRESS) => `lightning:${address}`;
export const bitcoinUri = (address: string = BTC_ADDRESS) => `bitcoin:${address}`;

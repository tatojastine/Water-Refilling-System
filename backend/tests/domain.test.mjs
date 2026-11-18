import { expect, test } from 'vitest';
import { quote, validEmail } from '../domain.mjs';

test('B-T1 accepts a well-formed email address', () => {
  expect(validEmail('customer@example.test')).toBe(true);
});

test('B-T2 rejects a malformed email address', () => {
  expect(validEmail('customer.example.test')).toBe(false);
});

test('B-T4 quotes a standard delivery with its delivery fee', () => {
  const items = [{ id: 'medium', price: 25, qty: 2 }];

  expect(quote(items, 'Delivery')).toEqual({ subtotal: 50, fee: 20, total: 70 });
});

test('B-T5 waives the delivery fee when one large refill is included', () => {
  const items = [{ id: 'medium', price: 25, qty: 2 }, { id: 'large', price: 40, qty: 1 }];

  expect(quote(items, 'Delivery')).toEqual({ subtotal: 90, fee: 0, total: 90 });
});

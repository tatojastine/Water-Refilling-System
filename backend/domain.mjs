import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const products = [
  { id: 'large', name: '5 Gallons', price: 40, stock: 0, unit: 'pcs', min: 8 },
  { id: 'medium', name: '3 Gallons', price: 25, stock: 0, unit: 'pcs', min: 8 },
  { id: 'small', name: '1 Gallon', price: 10, stock: 0, unit: 'pcs', min: 8 },
];

export function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function invalid(message) {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

function conflict(code, message) {
  throw new AppError(409, code, message);
}

function stringField(value, label, maxLength, required = true) {
  if (typeof value !== 'string' || value.length > maxLength || (required && !value.trim())) {
    invalid(`Enter a valid ${label} of up to ${maxLength} characters.`);
  }
  return value.trim();
}

function stockField(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    invalid(`${label} must be a whole number between 0 and 1,000,000.`);
  }
  return value;
}

export function quote(items, method) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const fee = method === 'Delivery' && !items.some((item) => item.id === 'large') ? 20 : 0;
  return { subtotal, fee, total: subtotal + fee };
}

export function seed() {
  return { version: 2, inventory: structuredClone(products), orders: [], accounts: [], next: 1 };
}

export function viewState(state, { id: accountId, role, name, address }) {
  if (role === 'admin') return { accountId, inventory: state.inventory, orders: state.orders, profile: null };
  return {
    accountId,
    inventory: state.inventory.filter((item) => item.price !== undefined),
    orders: state.orders.filter((order) => order.owner === accountId),
    profile: { name, address },
  };
}

export function isValidState(state) {
  const whole = (value) => Number.isSafeInteger(value) && value >= 0;
  const nonempty = (value) => typeof value === 'string' && Boolean(value.trim());
  if (state?.version !== 2 || !Array.isArray(state.inventory) || !Array.isArray(state.orders) ||
      !Array.isArray(state.accounts) || !Number.isSafeInteger(state.next) || state.next < 1) return false;

  const accounts = new Map();
  const emails = new Set();
  let owners = 0;
  for (const account of state.accounts) {
    if (!/^[a-f0-9-]{36}$/.test(account?.id) || accounts.has(account.id) ||
        !['admin', 'customer'].includes(account.role) || !nonempty(account.name) ||
        !validEmail(account.email) || account.email !== account.email.toLowerCase() || emails.has(account.email) ||
        typeof account.address !== 'string' || !/^[a-f0-9]{32}$/.test(account.salt) ||
        !/^[a-f0-9]{128}$/.test(account.hash)) return false;
    if (account.role === 'admin' && ++owners > 1) return false;
    accounts.set(account.id, account);
    emails.add(account.email);
  }
  for (const product of products) {
    if (!state.inventory.some((item) => item?.id === product.id && item.price === product.price)) return false;
  }

  const stock = new Map();
  for (const item of state.inventory) {
    if (!nonempty(item?.id) || stock.has(item.id) || !nonempty(item.name) || !nonempty(item.unit) ||
        !whole(item.stock) || !whole(item.min) || (item.price !== undefined && !whole(item.price))) return false;
    stock.set(item.id, item);
  }
  const ids = new Set();
  for (const order of state.orders) {
    if (!whole(order?.id) || order.id === 0 || order.id >= state.next || ids.has(order.id) ||
        !nonempty(order.customer) || accounts.get(order.owner)?.role !== 'customer' || !['Delivery', 'Pickup'].includes(order.method) ||
        typeof order.address !== 'string' || !['Cash', 'GCash'].includes(order.payment) ||
        !nonempty(order.created) || !Number.isFinite(Date.parse(order.created)) ||
        !Array.isArray(order.items) || !order.items.length) return false;
    const transit = order.method === 'Delivery' ? 'On Delivery' : 'Ready for Pickup';
    if (!['Pending', transit, 'Completed', 'Cancelled'].includes(order.status)) return false;
    if (order.status === 'Completed' ? !nonempty(order.completed) || !Number.isFinite(Date.parse(order.completed)) : order.completed !== null) return false;
    const items = new Set();
    for (const item of order.items) {
      if (stock.get(item?.id)?.price === undefined || items.has(item.id) || !nonempty(item.name) ||
          !whole(item.price) || !whole(item.qty) || item.qty < 1) return false;
      items.add(item.id);
    }
    const amounts = quote(order.items, order.method);
    if (!Object.entries(amounts).every(([key, value]) => whole(value) && order[key] === value)) return false;
    ids.add(order.id);
  }
  return true;
}

function getOrder(state, id, account) {
  const order = state.orders.find((item) => item.id === id);
  if (!order || (account.role === 'customer' && order.owner !== account.id)) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order unavailable.');
  }
  return order;
}

export function saveOrder(state, id, account, payload) {
  const current = id === null ? null : getOrder(state, id, account);
  if (current && (current.status !== 'Pending' || current.payment !== 'Cash')) {
    conflict('ORDER_NOT_EDITABLE', 'Only pending cash orders can be edited.');
  }

  const { method, payment, simulateFailure = false } = payload;
  if (!['Delivery', 'Pickup'].includes(method)) invalid('Select delivery or pickup.');
  if (!['Cash', 'GCash'].includes(payment) || (current && payment !== current.payment)) {
    invalid('Select an available payment method.');
  }
  if (typeof simulateFailure !== 'boolean' || (simulateFailure && (payment !== 'GCash' || current))) {
    invalid('Payment failure can be simulated only for a new GCash order.');
  }

  const address = method === 'Delivery' ? stringField(payload.address, 'delivery address', 250) : '';
  const catalog = state.inventory.filter((item) => item.price !== undefined);
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > catalog.length) {
    invalid('Add at least one valid refill.');
  }
  const existing = new Map(current?.items.map((item) => [item.id, item]));
  const requested = new Map();
  for (const item of payload.items) {
    const product = catalog.find((entry) => entry.id === item?.id);
    if (!product || requested.has(product.id) || !Number.isSafeInteger(item.qty) || item.qty < 1) {
      invalid('Provide each refill once with a positive whole quantity.');
    }
    const previous = existing.get(product.id);
    if (item.qty > product.stock + (previous?.qty ?? 0)) {
      conflict('STOCK_CHANGED', 'Stock changed. Return to your order and adjust the quantity.');
    }
    requested.set(product.id, { id: product.id, name: product.name, price: previous?.price ?? product.price, qty: item.qty });
  }
  if (simulateFailure) {
    throw new AppError(422, 'PAYMENT_FAILED', 'The simulated GCash payment failed. Retry or choose cash.');
  }

  for (const product of catalog) {
    product.stock += (existing.get(product.id)?.qty ?? 0) - (requested.get(product.id)?.qty ?? 0);
  }
  const items = [...requested.values()];
  const order = current ?? {
    id: state.next++, owner: account.id, customer: account.name, status: 'Pending',
    created: new Date().toISOString(), completed: null,
  };
  Object.assign(order, { items, method, address, payment, ...quote(items, method) });
  if (!current) state.orders.push(order);
  return order;
}

export function updateStatus(state, id, account, { status }) {
  const order = getOrder(state, id, account);
  if (!['Cancelled', 'On Delivery', 'Ready for Pickup', 'Completed'].includes(status)) {
    invalid('Select a valid next status.');
  }
  if (account.role === 'customer' && status !== 'Cancelled') {
    throw new AppError(403, 'FORBIDDEN', 'Only station staff can advance an order.');
  }
  const transit = order.method === 'Delivery' ? 'On Delivery' : 'Ready for Pickup';
  const cancelling = order.status === 'Pending' && status === 'Cancelled';
  const advancing = (order.status === 'Pending' && status === transit) || (order.status === transit && status === 'Completed');
  if (!cancelling && !advancing) conflict('INVALID_TRANSITION', 'This order has already changed or cannot move to that status.');

  if (cancelling) {
    for (const item of order.items) state.inventory.find((product) => product.id === item.id).stock += item.qty;
  }
  order.status = status;
  if (status === 'Completed') order.completed = new Date().toISOString();
  return order;
}

export function saveInventory(state, id, payload) {
  const item = id === null ? null : state.inventory.find((entry) => entry.id === id);
  if (id !== null && !item) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item unavailable.');
  if (item) {
    if (!Number.isSafeInteger(payload.expectedStock) || payload.expectedStock < 0) invalid('Provide the previously displayed stock.');
    if (item.stock !== payload.expectedStock) {
      conflict('STOCK_CHANGED', 'Stock changed while you were editing. Open Inventory again and review the current stock before saving.');
    }
  }
  const product = item?.price !== undefined;
  const name = product ? item.name : stringField(payload.name, 'item name', 60);
  const unit = product ? item.unit : stringField(payload.unit, 'unit', 20);
  if (state.inventory.some((entry) => entry.id !== id && entry.name.toLowerCase() === name.toLowerCase())) {
    conflict('DUPLICATE_ITEM', 'An item with that name already exists.');
  }
  const stock = stockField(payload.stock, 'Stock');
  const min = stockField(payload.min, 'Restock level');
  const reserved = product ? state.orders.reduce((total, order) => {
    if (['Completed', 'Cancelled'].includes(order.status)) return total;
    return total + (order.items.find((entry) => entry.id === id)?.qty ?? 0);
  }, 0) : 0;
  if (stock + reserved > 1_000_000) invalid(`Available stock can be at most ${1_000_000 - reserved} while refills are reserved.`);
  const values = { name, unit, stock, min };
  if (item) Object.assign(item, values);
  else state.inventory.push({ id: `supply-${randomUUID()}`, ...values });
}

export function saveProfile(state, accountId, { name, address }) {
  const account = state.accounts.find((entry) => entry.id === accountId);
  account.name = stringField(name, 'name', 80);
  account.address = stringField(address, 'default address', 250, false);
}

export function add(a, b) {
  return a + b;
}

export function subtract(a, b) {
  return a - b;
}

export function multiply(a, b) {
  return a * b;
}

export function divide(a, b) {
  if (b === 0) {
    throw new Error('Cannot divide by zero');
  }
  return a / b;
}

export function power(base, exponent) {
  return base ** exponent;
}

export function sqrt(a) {
  if (a < 0) {
    throw new Error('Cannot calculate square root of a negative number');
  }
  return Math.sqrt(a);
}
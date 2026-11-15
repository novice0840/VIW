import { describe, expect, it } from 'vitest';
import { parseSeed } from './seed';

describe('parseSeed', () => {
  it('정수는 그 값을 쓴다', () => {
    expect(parseSeed('12345')).toBe(12345);
    expect(parseSeed('-7')).toBe(-7);
    expect(parseSeed('  42 ')).toBe(42);
  });

  it('32비트를 넘는 정수는 잘라서 쓴다', () => {
    expect(parseSeed('4294967296')).toBe(0); // 2^32
    expect(parseSeed('2147483648')).toBe(-2147483648); // 2^31
  });

  it('문자열은 Java String.hashCode와 같은 값으로 바꾼다', () => {
    expect(parseSeed('hello')).toBe(99162322);
    expect(parseSeed('hello')).toBe(parseSeed('hello'));
  });

  it('빈 입력은 null이다', () => {
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('   ')).toBeNull();
  });
});

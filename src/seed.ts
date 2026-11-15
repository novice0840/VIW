/**
 * @description 무작위 월드 시드(32비트 부호 있는 정수)를 만드는 함수
 *
 * 시드를 정하는 순간에만 무작위가 필요하다. 그 뒤의 지형 생성은 전부 이 시드에서 결정된다.
 */
export function randomSeed(): number {
  return crypto.getRandomValues(new Int32Array(1))[0];
}

/**
 * @description 사람이 입력한 텍스트를 월드 시드로 바꾸는 함수
 *
 * 정수로 읽히면 그 값을 32비트로 자른 것을 쓰고, 아니면 문자열 해시를 쓴다
 * (마인크래프트처럼 "hello" 같은 단어도 시드로 쓸 수 있게).
 * 앞뒤 공백을 지운 뒤 빈 문자열이면 null을 돌려준다 — 호출하는 쪽에서 무작위 시드로 대신한다.
 */
export function parseSeed(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (/^-?\d+$/.test(trimmed)) return Number(BigInt.asIntN(32, BigInt(trimmed)));

  // Java String.hashCode와 같은 방식: h = 31 * h + 문자 코드, 32비트로 넘치는 부분은 버린다.
  let h = 0;
  for (let i = 0; i < trimmed.length; i++) {
    h = (Math.imul(h, 31) + trimmed.charCodeAt(i)) | 0;
  }
  return h;
}

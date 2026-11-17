/** Node 流的第三方声明允许 any；在单一边界检查真实二进制块。 */
export async function* binaryChunks(source: AsyncIterable<unknown>) {
  for await (const chunk of source) {
    if (!(chunk instanceof Uint8Array)) throw Error('Expected binary stream');
    yield chunk;
  }
}

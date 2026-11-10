// Image-shaped bytes, not decodable images: each starts with its format's signature, then bytes
// that a text round trip would corrupt, such as NUL, high bytes, and an invalid UTF-8 sequence.
const binaryTail = [0x00, 0x01, 0x7f, 0x80, 0xc3, 0x28, 0xfe, 0xff];

/**
 * A saved JPEG image used by MCP tests.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...binaryTail, 0xff, 0xd9]);

/**
 * A saved PNG image used by MCP tests.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...binaryTail]);

/**
 * A saved WebP image used by MCP tests.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const webp = new Uint8Array([
  0x52,
  0x49,
  0x46,
  0x46,
  0x10,
  0x00,
  0x00,
  0x00,
  0x57,
  0x45,
  0x42,
  0x50,
  ...binaryTail,
]);

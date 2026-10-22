/**
 * A saved book used by MCP tests.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const book = {
  id: "12",
  title: "The Hobbit",
  author: "J. R. R. Tolkien",
  category: { id: "9", name: "fiction", icon: "other", color: "grey", kinds: ["book"] },
  readingLevel: "Grade 4",
  hasImage: false,
};

/**
 * Input corresponding to the saved book fixture.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const createBookPayload = {
  title: "The Hobbit",
  author: "J. R. R. Tolkien",
  category: "Fiction",
  readingLevel: "Grade 4",
};

/**
 * Maps a lowercase file extension to its supported upload image type.
 *
 * @category utils
 * @since 0.1.0
 */
export const getImageContentType = (extension: string) => {
  switch (extension) {
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return undefined;
  }
};

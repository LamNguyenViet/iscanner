import { StyleSheet, View } from 'react-native';
import { computePlacement, MARGIN_POINTS, type Align, type PageLayout } from '../pdf/layout';

type Props = {
  layout: PageLayout;
  align: Align;
  imageSize: { width: number; height: number };
  /** Preview width in dp; the height follows the page aspect ratio. */
  width?: number;
};

/** Mini PDF page: paper outline, printable-area margin and the image rect from computePlacement. */
export function PagePreview({ layout, align, imageSize, width = 120 }: Props) {
  const placement = computePlacement(imageSize, layout, align);
  const scale = width / placement.pageWidth;
  const height = placement.pageHeight * scale;
  const imageOnly = layout.pageSize === 'image';
  const margin = MARGIN_POINTS[layout.margin] * scale;
  // PDF coordinates have their origin bottom-left; the preview uses top-left.
  const imageStyle = {
    left: placement.x * scale,
    top: (placement.pageHeight - placement.y - placement.height) * scale,
    width: placement.width * scale,
    height: placement.height * scale,
  };

  return (
    <View
      testID="page-preview-paper"
      style={[styles.paper, imageOnly && styles.imageOnly, { width, height }]}
    >
      <View testID="page-preview-image" style={[styles.image, imageStyle]} />
      {!imageOnly && align !== 'fill' && margin > 0 && (
        <View
          testID="page-preview-margin"
          pointerEvents="none"
          style={[styles.margin, { left: margin, top: margin, right: margin, bottom: margin }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    overflow: 'hidden',
  },
  imageOnly: { borderWidth: 0, backgroundColor: 'transparent' },
  image: { position: 'absolute', backgroundColor: '#9db7d9' },
  margin: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1242f',
    borderStyle: 'dashed',
  },
});

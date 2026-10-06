import { render, screen } from '@testing-library/react-native';
import { PagePreview } from '../../src/components/PagePreview';

function styleOf(testID: string) {
  return Object.assign({}, ...[screen.getByTestId(testID).props.style].flat());
}

test('A4 medium: image rect scaled from computePlacement', async () => {
  await render(
    <PagePreview
      layout={{ pageSize: 'a4', margin: 'medium' }}
      align="center"
      imageSize={{ width: 1000, height: 2000 }}
      width={120}
    />,
  );
  const s = styleOf('page-preview-image');
  expect(Math.abs(s.width - (120 * 392.6) / 595.28)).toBeLessThanOrEqual(1);
  expect(Math.abs(s.height - (120 * 785.2) / 595.28)).toBeLessThanOrEqual(1);
  expect(Math.abs(s.left - (120 * (595.28 - 392.6)) / 2 / 595.28)).toBeLessThanOrEqual(1);
  const paper = styleOf('page-preview-paper');
  expect(paper.width).toBeCloseTo(120);
  expect(paper.height).toBeCloseTo((120 * 841.89) / 595.28);
});

test('top align puts the image at the top margin (top-left origin)', async () => {
  await render(
    <PagePreview
      layout={{ pageSize: 'a4', margin: 'medium' }}
      align="top"
      imageSize={{ width: 2000, height: 1000 }}
      width={120}
    />,
  );
  // landscape image -> landscape page 841.89 wide; scale 120/841.89
  const s = styleOf('page-preview-image');
  expect(s.top).toBeCloseTo((28.35 * 120) / 841.89, 1);
});

test('bottom align puts the image at the bottom margin', async () => {
  await render(
    <PagePreview
      layout={{ pageSize: 'a4', margin: 'medium' }}
      align="bottom"
      imageSize={{ width: 2000, height: 1000 }}
      width={120}
    />,
  );
  const s = styleOf('page-preview-image');
  const paper = styleOf('page-preview-paper');
  expect(s.top + s.height).toBeCloseTo(paper.height - (28.35 * 120) / 841.89, 1);
});

test('image page size shows the image only', async () => {
  await render(
    <PagePreview
      layout={{ pageSize: 'image', margin: 'medium' }}
      align="center"
      imageSize={{ width: 1000, height: 2000 }}
      width={120}
    />,
  );
  const s = styleOf('page-preview-image');
  expect(s).toEqual(expect.objectContaining({ left: 0, top: 0, width: 120, height: 240 }));
  expect(screen.queryByTestId('page-preview-margin')).toBeNull();
});

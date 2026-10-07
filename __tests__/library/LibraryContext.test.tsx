import { Text, Pressable } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { LibraryProvider, useLibrary } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { log } from '../../src/logging/logger';

function Consumer() {
  const { documents, loading, rename, remove } = useLibrary();
  return (
    <>
      <Text testID="loading">{loading ? 'yes' : 'no'}</Text>
      {documents.map((d) => (
        <Text key={d.id}>{d.name}</Text>
      ))}
      {documents[0] && (
        <>
          <Pressable testID="rename" onPress={() => rename(documents[0].id, 'Renamed')} />
          <Pressable testID="remove" onPress={() => remove(documents[0].id)} />
        </>
      )}
    </>
  );
}

async function setup() {
  const store = createLibraryStore({ fs: createMemoryFs() });
  await store.add(new Uint8Array([1, 2, 3]), { name: 'Receipt', pageCount: 1, source: 'scan' });
  await render(
    <LibraryProvider store={store}>
      <Consumer />
    </LibraryProvider>,
  );
  return store;
}

describe('LibraryContext', () => {
  it('loads documents on mount', async () => {
    await setup();
    expect(await screen.findByText('Receipt')).toBeTruthy();
    expect(screen.getByTestId('loading').props.children).toBe('no');
  });

  it('remove makes the document disappear', async () => {
    await setup();
    await screen.findByText('Receipt');
    await fireEvent.press(screen.getByTestId('remove'));
    await act(async () => {});
    expect(screen.queryByText('Receipt')).toBeNull();
  });

  it('rename shows the new name', async () => {
    await setup();
    await screen.findByText('Receipt');
    await fireEvent.press(screen.getByTestId('rename'));
    expect(await screen.findByText('Renamed')).toBeTruthy();
    expect(screen.queryByText('Receipt')).toBeNull();
  });

  it('a failed initial load ends loading without an unhandled rejection', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const store = createLibraryStore({ fs: createMemoryFs() });
      jest.spyOn(store, 'list').mockRejectedValue(new Error('io'));
      await render(
        <LibraryProvider store={store}>
          <Consumer />
        </LibraryProvider>,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(screen.getByTestId('loading').props.children).toBe('no');
      expect(log.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cause: expect.any(Error) }));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

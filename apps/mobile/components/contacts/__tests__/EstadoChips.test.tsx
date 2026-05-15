// apps/mobile/components/contacts/__tests__/EstadoChips.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import EstadoChips from '../EstadoChips';

test('renders Todos + 4 estado chips and fires onChange', () => {
  const onChange = jest.fn();
  const { getByText } = render(<EstadoChips value={null} onChange={onChange} />);
  getByText('Todos');
  fireEvent.press(getByText('🟢 Apoya'));
  expect(onChange).toHaveBeenCalledWith('apoya');
});

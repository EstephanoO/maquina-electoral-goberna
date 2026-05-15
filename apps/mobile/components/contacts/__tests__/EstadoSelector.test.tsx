import { render, fireEvent } from '@testing-library/react-native';
import EstadoSelector from '../EstadoSelector';

test('selects an estado and calls onChange', () => {
  const onChange = jest.fn();
  const { getByText } = render(<EstadoSelector value="duda" onChange={onChange} />);
  fireEvent.press(getByText('Apoya'));
  expect(onChange).toHaveBeenCalledWith('apoya');
});

// apps/mobile/components/contacts/__tests__/PhotoField.test.tsx
import { render } from '@testing-library/react-native';
import { Image } from 'react-native';
import { PhotoField } from '../PhotoField';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

describe('PhotoField', () => {
  it('renders placeholder text "Agregar foto" when value is null', () => {
    const { getByText } = render(<PhotoField value={null} onChange={() => {}} />);
    getByText('Agregar foto');
  });

  it('renders an Image when a uri value is provided', () => {
    const { UNSAFE_getByType, queryByText } = render(
      <PhotoField value="file:///fake/photo.jpg" onChange={() => {}} />,
    );
    // Image component is present
    UNSAFE_getByType(Image);
    // Placeholder text is gone
    expect(queryByText('Agregar foto')).toBeNull();
  });
});

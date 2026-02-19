/**
 * Lista de departamentos del Peru
 * Usada para el selector de region en el registro
 */

export type Departamento = {
  code: string;
  name: string;
};

export const DEPARTAMENTOS: Departamento[] = [
  { code: 'AMAZONAS', name: 'Amazonas' },
  { code: 'ANCASH', name: 'Ancash' },
  { code: 'APURIMAC', name: 'Apurimac' },
  { code: 'AREQUIPA', name: 'Arequipa' },
  { code: 'AYACUCHO', name: 'Ayacucho' },
  { code: 'CAJAMARCA', name: 'Cajamarca' },
  { code: 'CALLAO', name: 'Callao' },
  { code: 'CUSCO', name: 'Cusco' },
  { code: 'HUANCAVELICA', name: 'Huancavelica' },
  { code: 'HUANUCO', name: 'Huanuco' },
  { code: 'ICA', name: 'Ica' },
  { code: 'JUNIN', name: 'Junin' },
  { code: 'LA_LIBERTAD', name: 'La Libertad' },
  { code: 'LAMBAYEQUE', name: 'Lambayeque' },
  { code: 'LIMA', name: 'Lima' },
  { code: 'LORETO', name: 'Loreto' },
  { code: 'MADRE_DE_DIOS', name: 'Madre de Dios' },
  { code: 'MOQUEGUA', name: 'Moquegua' },
  { code: 'PASCO', name: 'Pasco' },
  { code: 'PIURA', name: 'Piura' },
  { code: 'PUNO', name: 'Puno' },
  { code: 'SAN_MARTIN', name: 'San Martin' },
  { code: 'TACNA', name: 'Tacna' },
  { code: 'TUMBES', name: 'Tumbes' },
  { code: 'UCAYALI', name: 'Ucayali' },
];

/**
 * Busca departamentos por nombre (case + accent insensitive)
 */
export function searchDepartamentos(query: string): Departamento[] {
  if (!query.trim()) return DEPARTAMENTOS;
  
  const normalize = (str: string) =>
    str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const normalizedQuery = normalize(query);
  
  return DEPARTAMENTOS.filter((d) =>
    normalize(d.name).includes(normalizedQuery)
  );
}

/**
 * Obtiene el nombre de un departamento por su codigo
 */
export function getDepartamentoName(code: string): string | undefined {
  return DEPARTAMENTOS.find((d) => d.code === code)?.name;
}

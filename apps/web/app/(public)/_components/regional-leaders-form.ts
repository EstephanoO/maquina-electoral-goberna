export type LeaderFormValues = {
  nombres: string;
  apellidos: string;
  departamento: string;
  provincia: string;
  distrito: string;
  dni: string;
  celular: string;
  direccion_domicilio: string;
};

export type LeaderFormErrors = Partial<Record<keyof LeaderFormValues, string>>;

export const INITIAL_VALUES: LeaderFormValues = {
  nombres: "",
  apellidos: "",
  departamento: "",
  provincia: "",
  distrito: "",
  dni: "",
  celular: "",
  direccion_domicilio: "",
};

function normalizeText(value: string) {
  return value.trim();
}

export function onlyDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function validateForm(values: LeaderFormValues): LeaderFormErrors {
  const errors: LeaderFormErrors = {};

  if (!normalizeText(values.nombres)) {
    errors.nombres = "Nombres es obligatorio.";
  }

  if (!normalizeText(values.apellidos)) {
    errors.apellidos = "Apellidos es obligatorio.";
  }

  if (!values.departamento) {
    errors.departamento = "Selecciona un departamento.";
  }

  if (!values.provincia) {
    errors.provincia = "Selecciona una provincia.";
  }

  if (!values.distrito) {
    errors.distrito = "Selecciona un distrito.";
  }

  if (!/^\d{8}$/.test(values.dni)) {
    errors.dni = "DNI debe tener exactamente 8 digitos.";
  }

  if (!/^\d{9}$/.test(values.celular)) {
    errors.celular = "Celular debe tener exactamente 9 digitos.";
  }

  if (!normalizeText(values.direccion_domicilio)) {
    errors.direccion_domicilio = "Direccion de domicilio es obligatorio.";
  }

  return errors;
}

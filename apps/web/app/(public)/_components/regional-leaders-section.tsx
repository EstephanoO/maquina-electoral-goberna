"use client";

import { useState, type FormEvent } from "react";
import { peruUbigeo } from "@/lib/data/peru-ubigeo";
import { Button, Card, SelectInput, TextInput } from "@/lib/ui";
import { FONT_STACK } from "@/lib/constants";
import {
  INITIAL_VALUES,
  onlyDigits,
  validateForm,
  type LeaderFormErrors,
  type LeaderFormValues,
} from "./regional-leaders-form";

export function RegionalLeadersSection() {
  const [values, setValues] = useState<LeaderFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<LeaderFormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const selectedDepartamento = peruUbigeo.find(
    (dep) => dep.departamento === values.departamento,
  );

  const selectedProvincia = selectedDepartamento?.provincias.find(
    (prov) => prov.provincia === values.provincia,
  );

  const departamentoOptions = peruUbigeo.map((dep) => ({
    value: dep.departamento,
    label: dep.departamento,
  }));

  const provinciaOptions =
    selectedDepartamento?.provincias.map((prov) => ({
      value: prov.provincia,
      label: prov.provincia,
    })) ?? [];

  const distritoOptions =
    selectedProvincia?.distritos.map((dist) => ({
      value: dist,
      label: dist,
    })) ?? [];

  function setField<K extends keyof LeaderFormValues>(field: K, value: LeaderFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSubmitted(false);
  }

  function handleDepartamentoChange(departamento: string) {
    setValues((prev) => ({
      ...prev,
      departamento,
      provincia: "",
      distrito: "",
    }));
    setErrors((prev) => ({
      ...prev,
      departamento: undefined,
      provincia: undefined,
      distrito: undefined,
    }));
    setSubmitted(false);
  }

  function handleProvinciaChange(provincia: string) {
    setValues((prev) => ({
      ...prev,
      provincia,
      distrito: "",
    }));
    setErrors((prev) => ({
      ...prev,
      provincia: undefined,
      distrito: undefined,
    }));
    setSubmitted(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setSubmitted(false);
      return;
    }

    setErrors({});
    setSubmitted(true);
  }

  return (
    <section
      id="lideres-regionales"
      style={{
        padding: "96px 24px",
        background: "var(--color-background)",
        fontFamily: FONT_STACK,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 40px" }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--goberna-gold-600)",
              display: "block",
              marginBottom: 16,
            }}
          >
            Red Territorial
          </span>
          <h2
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 16px",
              lineHeight: 1.2,
            }}
          >
            Registro de <span style={{ color: "var(--goberna-blue-700)" }}>líderes regionales</span>
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: "var(--color-text-secondary)",
              margin: 0,
            }}
          >
            Completa tus datos y registra tu liderazgo territorial para sumarte a la operación regional.
          </p>
        </div>

        <Card
          padding="lg"
          style={{
            maxWidth: 900,
            margin: "0 auto",
            border: "1px solid var(--goberna-blue-100)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <form onSubmit={handleSubmit} noValidate>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              <TextInput
                id="nombres"
                label="Nombres"
                placeholder="Ej. Juan Carlos"
                value={values.nombres}
                onChange={(e) => setField("nombres", e.target.value)}
                error={errors.nombres}
                autoComplete="given-name"
              />

              <TextInput
                id="apellidos"
                label="Apellidos"
                placeholder="Ej. Perez Quispe"
                value={values.apellidos}
                onChange={(e) => setField("apellidos", e.target.value)}
                error={errors.apellidos}
                autoComplete="family-name"
              />

              <SelectInput
                id="departamento"
                label="Departamento"
                value={values.departamento}
                onChange={(e) => handleDepartamentoChange(e.target.value)}
                options={departamentoOptions}
                placeholder="Selecciona un departamento"
                error={errors.departamento}
              />

              <SelectInput
                id="provincia"
                label="Provincia"
                value={values.provincia}
                onChange={(e) => handleProvinciaChange(e.target.value)}
                options={provinciaOptions}
                placeholder="Selecciona una provincia"
                error={errors.provincia}
                disabled={!values.departamento}
              />

              <SelectInput
                id="distrito"
                label="Distrito"
                value={values.distrito}
                onChange={(e) => setField("distrito", e.target.value)}
                options={distritoOptions}
                placeholder="Selecciona un distrito"
                error={errors.distrito}
                disabled={!values.provincia}
              />

              <TextInput
                id="dni"
                label="DNI"
                placeholder="8 digitos"
                value={values.dni}
                onChange={(e) => setField("dni", onlyDigits(e.target.value, 8))}
                error={errors.dni}
                inputMode="numeric"
                maxLength={8}
              />

              <TextInput
                id="celular"
                label="Celular"
                placeholder="9 digitos"
                value={values.celular}
                onChange={(e) => setField("celular", onlyDigits(e.target.value, 9))}
                error={errors.celular}
                inputMode="numeric"
                maxLength={9}
              />

              <TextInput
                id="direccion_domicilio"
                label="Direccion de domicilio"
                placeholder="Ej. Av. Los Heroes 123"
                value={values.direccion_domicilio}
                onChange={(e) => setField("direccion_domicilio", e.target.value)}
                error={errors.direccion_domicilio}
                autoComplete="street-address"
              />
            </div>

            <div
              style={{
                marginTop: 24,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <Button type="submit" variant="accent" size="lg" fullWidth>
                Enviar registro
              </Button>

              {submitted && (
                <p
                  role="status"
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--color-success)",
                    textAlign: "center",
                  }}
                >
                  Registro validado correctamente.
                </p>
              )}
            </div>
          </form>
        </Card>
      </div>
    </section>
  );
}

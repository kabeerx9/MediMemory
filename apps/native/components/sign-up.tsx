import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { StyleSheet, type TextStyle, Text } from "react-native";
import z from "zod";

import { Button, Card, ErrorNote, Field, useTheme } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { space, type } from "@/lib/theme";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").min(2, "Name must be at least 2 characters"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").min(8, "Use at least 8 characters"),
});

function getErrorMessage(error: unknown): string | null {
  if (!error) return null;

  if (typeof error === "string") {
    return error;
  }

  if (Array.isArray(error)) {
    for (const issue of error) {
      const message = getErrorMessage(issue);
      if (message) {
        return message;
      }
    }
    return null;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as { message?: unknown };
    if (typeof maybeError.message === "string") {
      return maybeError.message;
    }
  }

  return null;
}

function SignUp() {
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signUpSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      await authClient.signUp.email(
        {
          name: value.name.trim(),
          email: value.email.trim(),
          password: value.password,
        },
        {
          onError(error) {
            setError(error.error?.message || "Failed to sign up");
          },
          onSuccess() {
            setError(null);
            formApi.reset();
          },
        },
      );
    },
  });

  return (
    <Card style={styles.card}>
      <Text style={[type.heading as TextStyle, styles.title, { color: theme.text }]}>
        Create account
      </Text>

      <form.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          validationError: getErrorMessage(state.errorMap.onSubmit),
        })}
      >
        {({ isSubmitting, validationError }) => {
          const formError = error ?? validationError;

          return (
            <>
              {formError ? <ErrorNote message={formError} /> : null}

              <form.Field name="name">
                {(field) => (
                  <Field
                    label="Name"
                    placeholder="Your name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChangeText={(value) => {
                      field.handleChange(value);
                      if (error) {
                        setError(null);
                      }
                    }}
                    autoComplete="name"
                    textContentType="name"
                  />
                )}
              </form.Field>

              <form.Field name="email">
                {(field) => (
                  <Field
                    label="Email"
                    placeholder="you@example.com"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChangeText={(value) => {
                      field.handleChange(value);
                      if (error) {
                        setError(null);
                      }
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                  />
                )}
              </form.Field>

              <form.Field name="password">
                {(field) => (
                  <Field
                    label="Password"
                    placeholder="At least 8 characters"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChangeText={(value) => {
                      field.handleChange(value);
                      if (error) {
                        setError(null);
                      }
                    }}
                    secureTextEntry
                    autoComplete="password-new"
                    textContentType="newPassword"
                    onSubmitEditing={form.handleSubmit}
                  />
                )}
              </form.Field>

              <Button
                label="Create account"
                onPress={form.handleSubmit}
                loading={isSubmitting}
                full
                style={styles.submit}
              />
            </>
          );
        }}
      </form.Subscribe>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  title: {
    marginBottom: space.xs,
  },
  submit: {
    marginTop: space.xs,
  },
});

export { SignUp };

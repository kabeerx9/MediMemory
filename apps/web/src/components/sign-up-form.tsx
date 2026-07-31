import { Button } from "@caretalk/ui/components/button";
import { Card, CardContent } from "@caretalk/ui/components/card";
import { Input } from "@caretalk/ui/components/input";
import { Label } from "@caretalk/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const navigate = useNavigate({ from: "/" });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: { email: "", password: "", name: "" },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        { email: value.email, password: value.password, name: value.name },
        {
          onSuccess: () => {
            navigate({ to: "/workspaces" });
            toast.success("Account created");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) return <Loader />;

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <Card variant="light">
          <CardContent className="space-y-6 pt-8">
            <div className="space-y-1 text-center">
              <h2 className="font-display text-2xl font-semibold">Join Caretalk</h2>
              <p className="text-sm text-muted-foreground">
                Track a health journey, one memory at a time.
              </p>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              {(["name", "email", "password"] as const).map((fieldName) => (
                <form.Field key={fieldName} name={fieldName}>
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={field.name}>
                        {fieldName === "name" ? "Name" : fieldName === "email" ? "Email" : "Password"}
                      </Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        type={fieldName === "password" ? "password" : fieldName === "email" ? "email" : "text"}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      {field.state.meta.errors.map((error) => (
                        <p key={error?.message} className="text-sm text-destructive">
                          {error?.message}
                        </p>
                      ))}
                    </div>
                  )}
                </form.Field>
              ))}

              <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
                {({ canSubmit, isSubmitting }) => (
                  <Button className="w-full" disabled={!canSubmit || isSubmitting} type="submit">
                    {isSubmitting ? "Creating…" : "Create account"}
                  </Button>
                )}
              </form.Subscribe>
            </form>

            <div className="text-center">
              <Button onClick={onSwitchToSignIn} type="button" variant="link">
                Already have an account? Sign in
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Button } from "@health-conversation/ui/components/button";
import { Card, CardContent } from "@health-conversation/ui/components/card";
import { Input } from "@health-conversation/ui/components/input";
import { Label } from "@health-conversation/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { DisplayHero, Eyebrow, LimeKeyword, StarfieldCanvas } from "@/components/brand";
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
            navigate({ to: "/" });
            toast.success("Sign up successful");
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
    <StarfieldCanvas className="flex items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_420px]">
        <div className="hidden space-y-4 lg:block">
          <Eyebrow>Get started</Eyebrow>
          <DisplayHero>
            Build your health <LimeKeyword>workspace</LimeKeyword>
          </DisplayHero>
          <p className="type-body-lg max-w-md text-muted-foreground">
            One place for curated status, timeline, meds, and doctor questions — never raw chat dumps.
          </p>
        </div>

        <Card variant="light">
          <CardContent className="space-y-6 pt-8">
            <div className="space-y-1 text-center lg:text-left">
              <Eyebrow className="text-sentri-violet-mid">Create account</Eyebrow>
              <h2 className="font-display text-2xl font-semibold">Join MediMemory</h2>
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
    </StarfieldCanvas>
  );
}

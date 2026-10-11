import { Button } from "@caretalk/ui/components/button";
import { Card, CardContent } from "@caretalk/ui/components/card";
import { Input } from "@caretalk/ui/components/input";
import { Label } from "@caretalk/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { ConnectPair } from "@/features/connect/connect-visuals";
import { useOAuthClient } from "@/features/connect/use-oauth-client";
import { authClient, isOAuthFlow } from "@/lib/auth-client";

import Loader from "./loader";

type SignInResult = { url?: string; redirect?: boolean };

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const navigate = useNavigate({ from: "/" });
  const { isPending } = authClient.useSession();
  const oauthFlow = isOAuthFlow();

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        { email: value.email, password: value.password },
        {
          onSuccess: (context) => {
            // Mid-connect, the server answers sign-in with where the OAuth
            // flow continues (consent, or straight back to the app).
            const next = (context.data as SignInResult | null)?.url;
            if (oauthFlow && next) {
              window.location.assign(next);
              return;
            }
            navigate({ to: "/workspaces" });
            toast.success("Signed in");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
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
            {oauthFlow ? (
              <OAuthHeading />
            ) : (
              <div className="space-y-1 text-center">
                <h2 className="font-display text-2xl font-semibold text-card-foreground">Welcome back</h2>
                <p className="text-sm text-muted-foreground">Sign in to Caretalk</p>
              </div>
            )}

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>
                      Email
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
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

              <form.Field name="password">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>
                      Password
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
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

              <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
                {({ canSubmit, isSubmitting }) => (
                  <Button className="w-full" disabled={!canSubmit || isSubmitting} type="submit">
                    {isSubmitting ? "Signing in…" : "Sign in"}
                  </Button>
                )}
              </form.Subscribe>
            </form>

            <div className="text-center">
              <Button onClick={onSwitchToSignUp} type="button" variant="link">
                Need an account? Sign up
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OAuthHeading() {
  const { client } = useOAuthClient(false);
  const name = client?.name ?? "An app";
  return (
    <div className="space-y-4 text-center">
      <ConnectPair icon={client?.icon ?? null} name={name} />
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-semibold text-balance text-card-foreground">
          Sign in to connect {client ? name : "your app"}
        </h2>
        <p className="text-sm text-muted-foreground">
          You'll choose what it can do on the next screen.
        </p>
      </div>
    </div>
  );
}

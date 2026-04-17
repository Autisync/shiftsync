import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Shield, Lock, Eye } from "lucide-react";
import { useState } from "react";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";

interface AuthCardProps {
  onSignIn: (gdprConsent: boolean) => void;
  loading?: boolean;
}

export function AuthCard({ onSignIn, loading }: AuthCardProps) {
  const [gdprConsent, setGdprConsent] = useState(false);

  const handleSignIn = () => {
    if (gdprConsent) {
      onSignIn(true);
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-3 sm:p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardHeader className="text-center space-y-2 pb-4 sm:pb-6 p-4 sm:p-6">
            <div className="flex justify-center mb-6">
              <Link
                to="/"
                aria-label="ShiftSync home"
                className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-autisync-gold rounded-md"
              >
                <img
                  src="/logo.png"
                  alt="ShiftSync logo"
                  width={480}
                  height={480}
                  className="h-16 w-auto"
                  loading="eager"
                  decoding="async"
                />
                <span className="sr-only">ShiftSync</span>
              </Link>
            </div>

            <CardDescription className="text-sm sm:text-base">
              Sincronize o seu horário de trabalho com segurança no Google
              Calendar
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            {/* OAuth Scopes Disclosure */}
            <div className="bg-slate-50 rounded-xl p-3 sm:p-4 border border-slate-200">
              <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
                <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-xs sm:text-sm text-slate-900 mb-1">
                    Permissões de Acesso
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Esta aplicação irá solicitar permissão para:
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 sm:space-y-2 ml-6 sm:ml-8">
                <li className="text-xs text-slate-700 flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                  <span>Ver e gerir os seus eventos do Google Calendar</span>
                </li>
                <li className="text-xs text-slate-700 flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                  <span>Aceder às suas informações básicas de perfil</span>
                </li>
              </ul>
            </div>

            {/* GDPR Consent */}
            <div className="bg-blue-50 rounded-xl p-3 sm:p-4 border border-blue-200">
              <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-xs sm:text-sm text-blue-900 mb-1">
                    Conformidade com o RGPD e Privacidade
                  </h4>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    A privacidade dos seus dados é a nossa prioridade. Estamos
                    em conformidade com as regulamentações de proteção de dados
                    da UE.
                  </p>
                </div>
              </div>
              <div className="ml-6 sm:ml-8 space-y-1.5 sm:space-y-2 text-xs text-blue-800">
                <p>✓ Os seus dados são processados de forma segura</p>
                <p>✓ Nenhum dado é armazenado em servidores externos</p>
                <p>✓ Pode revogar o acesso a qualquer momento</p>
              </div>
            </div>

            {/* Consent Checkbox */}
            <div className="flex items-start space-x-2 sm:space-x-3 pt-2">
              <Checkbox
                id="gdpr-consent"
                checked={gdprConsent}
                onCheckedChange={(checked) => setGdprConsent(checked === true)}
                className="mt-1"
              />
              <div className="space-y-1 flex-1">
                <Label
                  htmlFor="gdpr-consent"
                  className="text-xs sm:text-sm font-medium leading-relaxed cursor-pointer"
                >
                  Consinto no processamento dos meus dados
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ao marcar esta caixa, concorda com as nossas práticas de
                  processamento de dados e reconhece que compreende como os seus
                  dados serão utilizados.{" "}
                  <span>
                    <a
                      className="hover:text-autisync-gold underline"
                      href="/privacy"
                    >
                      Política de Privacidade
                    </a>{" "}
                    e{" "}
                    <a
                      href="/terms"
                      className="hover:text-autisync-gold underline"
                    >
                      Termos de Serviço
                    </a>
                  </span>
                </p>
              </div>
            </div>

            {/* Sign In Button */}
            <Button
              onClick={handleSignIn}
              disabled={!gdprConsent || loading}
              className="w-full h-10 sm:h-12 text-sm sm:text-base font-semibold shadow-lg hover:shadow-xl transition-all"
              size="lg"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4 text-white" />A conectar...
                </span>
              ) : (
                "Iniciar sessão com Google"
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground px-2 sm:px-4">
              A sua autenticação é tratada de forma segura pela Google. Nunca
              vemos a sua palavra-passe.
            </p>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </>
  );
}

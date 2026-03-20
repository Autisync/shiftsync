import React from "react";
import { Link } from "react-router-dom";
import CookiePreferencesLink from "@/components/cookies/CookiePreferencesLink";

const Footer: React.FC = () => {
  return (
    <footer className="mt-10 shadow-md bg-white/70 backdrop-blur-sm text-xs">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-3">ShiftSync</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              O ShiftSync ajuda-o a sincronizar horários de trabalho do Excel
              para o Google Calendar, de forma segura e eficiente.
            </p>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wide">
              Legal
            </h4>
            <ul className="space-y-1 text-sm">
              <li>
                <Link
                  to="/privacy"
                  className="text-slate-600 hover:text-autisync-gold transition-colors"
                >
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-slate-600 hover:text-autisync-gold transition-colors"
                >
                  Termos de Serviço
                </Link>
              </li>
              <li>
                <a
                  href="/cookies"
                  className="text-slate-600 hover:text-autisync-gold transition-colors"
                >
                  Política de Cookies
                </a>
              </li>
              <li>
                <a
                  href="/datadeletion"
                  className="text-slate-600 hover:text-autisync-gold transition-colors"
                >
                  RGPD & Proteção de Dados
                </a>
              </li>
              <li>
                <CookiePreferencesLink />
              </li>
            </ul>
          </div>

          {/* Contact / Compliance */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-4 uppercase tracking-wide">
              Contacto & Compliance
            </h4>
            <ul className="space-y-1 text-sm">
              <li>
                <a
                  href="mailto:support@autisync.com"
                  className="text-slate-600 hover:text-autisync-gold transition-colors"
                >
                  support@autisync.com
                </a>
              </li>
              <li>
                <a
                  href="https://tally.so/r/J9AjDr"
                  className="text-slate-600 hover:text-autisync-gold transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Feedback
                </a>
              </li>
              <li>
                <a
                  href="https://tally.so/r/1A7YOO"
                  className="text-slate-600 hover:text-autisync-gold transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Reportar Erros
                </a>
              </li>
              <li className="text-slate-500">Em Conformidade com RGPD da UE</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>
            © {new Date().getFullYear()} Autisync. Todos os direitos reservados.
          </span>
          <span className="text-xs text-autisync-gold/70">Versão Beta 1.1</span>
          <span>
            {" "}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#B98B2F] rounded-full animate-pulse" />
              <span className="text-[#1C1C1C]/40">
                Todos os Sistemas Operacionais
              </span>
            </div>
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

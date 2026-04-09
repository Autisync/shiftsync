import { Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  AnimatePresence,
} from "framer-motion";
import type { Variants } from "framer-motion";
import Footer from "./Footer";

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
};

const slideInLeft = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0 },
};

const slideInRight = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0 },
};

// Reusable component for scroll-triggered animations
const ScrollReveal = ({
  children,
  variant = fadeInUp,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  variant?: Variants;
  delay?: number;
  className?: string;
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={variant}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const Landing = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.95]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Smooth scroll handler
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offsetTop = element.offsetTop - 80; // Account for fixed navbar
      window.scrollTo({
        top: offsetTop,
        behavior: "smooth",
      });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Stagger children animation
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="bg-autisync-surface text-autisync-black">
      {/* ===================== HERO ===================== */}

      <section className="px-6 pt-8 pb-24 bg-[#F6EED8] overflow-hidden">
        {/* ===================== NAV ===================== */}
        <motion.nav
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={`fixed top-0 left-0 right-0 z-50 px-6 py-4 transition-all duration-300 ${
            isScrolled
              ? "bg-white/70 backdrop-blur-md shadow-lg border-b border-white/20"
              : "bg-transparent"
          }`}
        >
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="text-xl font-semibold text-autisync-black">
              <div className="flex justify-center">
                <Link
                  to="/"
                  aria-label="ShiftSync home"
                  className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-autisync-gold rounded-md"
                >
                  <motion.img
                    whileHover={{ scale: 1.05, rotate: 5 }}
                    transition={{ duration: 0.3 }}
                    src="/logo_.png"
                    alt="ShiftSync logo"
                    width={480}
                    height={480}
                    className="h-12 w-auto"
                    loading="eager"
                    decoding="async"
                  />
                  <span className="sr-only">ShiftSync</span>
                </Link>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="hidden md:flex items-center gap-8 text-sm font-medium text-autisync-black/70"
            >
              <motion.button
                whileHover={{ y: -2 }}
                onClick={() => scrollToSection("features")}
                className="hover:text-autisync-black transition-colors cursor-pointer"
              >
                Funcionalidades
              </motion.button>
              <motion.button
                whileHover={{ y: -2 }}
                onClick={() => scrollToSection("pricing")}
                className="hover:text-autisync-black transition-colors cursor-pointer"
              >
                Preços
              </motion.button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              <Link
                to="/home"
                className="px-5 py-2 rounded-full bg-autisync-gold text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Acesso antecipado
              </Link>
            </motion.div>
          </div>
        </motion.nav>

        {/* Add padding to account for fixed navbar */}
        <div className="h-20"></div>

        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="max-w-6xl mx-auto"
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-[32px] shadow-xl"
          >
            {/* Background image */}
            <motion.img
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              src="/images/hero_cafe.jpg"
              alt="ShiftSync preview"
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />

            {/* Content */}
            <div className="relative z-10 grid md:grid-cols-2 gap-12 p-10 md:p-16 min-h-[420px] items-center">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <motion.span
                  variants={itemVariants}
                  className="inline-block mb-4 px-4 py-1 text-sm rounded-full bg-autisync-gold text-white"
                >
                  Agora em beta
                </motion.span>

                <motion.h1
                  variants={itemVariants}
                  className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6"
                >
                  O seu horário.
                  <br />
                  Sempre consigo.
                </motion.h1>

                <motion.p
                  variants={itemVariants}
                  className="text-lg md:text-xl text-white/90 max-w-md mb-8 leading-relaxed"
                >
                  O ShiftSync transforma a sua escala confusa num plano claro—
                  automaticamente.
                </motion.p>

                <motion.div variants={itemVariants}>
                  <Link
                    to="/home"
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-autisync-gold text-white text-base font-semibold hover:opacity-90 transition-opacity shadow-lg"
                  >
                    Acesso antecipado
                    <motion.span
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      aria-hidden
                    >
                      →
                    </motion.span>
                  </Link>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ===================== PAIN POINTS SECTION ============ */}
      <section className="py-28 px-6 bg-gradient-to-r from-[#FBF7EF] to-white">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          {/* LEFT CONTENT */}
          <ScrollReveal variant={slideInLeft}>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              Gerir turnos não
              <br />
              devia ser trabalho
              <br />
              extra.
            </h2>

            <p className="text-lg md:text-xl text-autisync-black/70 max-w-lg mb-10 leading-relaxed">
              Capturas de ecrã, folhas de cálculo, chats de grupo—a sua escala
              vive em dez sítios. É assim que os erros acontecem.
            </p>

            {/* STAT CARD */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.6 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="flex items-center gap-4 p-5 bg-white rounded-xl border border-autisync-gold/30 max-w-md shadow-md"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                className="h-10 w-10 flex items-center justify-center rounded-full bg-autisync-gold/15 text-autisync-gold text-xl"
              >
                ⏱
              </motion.div>
              <div>
                <p className="font-semibold text-base">
                  73% dos trabalhadores por turnos
                </p>
                <p className="text-sm text-autisync-black/60 leading-relaxed">
                  já chegaram atrasados devido a confusão com horários
                </p>
              </div>
            </motion.div>
          </ScrollReveal>

          {/* RIGHT IMAGE CARD */}
          <ScrollReveal variant={slideInRight} delay={0.2}>
            <div className="relative rounded-[28px] overflow-hidden shadow-xl">
              <motion.img
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.6 }}
                src="/images/problem_sofa.jpg"
                alt="Shift confusion"
                className="w-full h-full object-cover"
              />

              <div className="absolute inset-0 bg-black/55" />

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="absolute bottom-6 left-6 right-6 text-white"
              >
                <p className="text-sm uppercase tracking-wide text-autisync-gold mb-4">
                  Frustrações comuns
                </p>
                <motion.ul
                  variants={containerVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="space-y-3 text-sm"
                >
                  {[
                    "📸 As capturas de ecrã perdem-se na galeria.",
                    "🗓 Atualizações manuais = calendários desatualizados.",
                    "❓ Nunca sabe qual é a versão correta.",
                    "👨‍👩‍👧 Família e amigos não sabem quando está livre.",
                  ].map((item, i) => (
                    <motion.li key={i} variants={itemVariants}>
                      {item}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ===================== SOLUTION SECTION ===================== */}
      <section className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          {/* LEFT CONTENT */}
          <ScrollReveal variant={slideInLeft}>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              Um lugar. Sempre
              <br />
              atualizado. Sem
              <br />
              esforço.
            </h2>

            <p className="text-lg md:text-xl text-autisync-black/70 max-w-lg mb-10 leading-relaxed">
              O ShiftSync lê a sua escala e cria o seu calendário—completo com
              trocas, lembretes e atualizações partilháveis.
            </p>

            <motion.ul
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="space-y-4"
            >
              {[
                "Sincronização automática",
                "Atualizações em tempo real",
                "Partilhe com qualquer pessoa",
              ].map((item, i) => (
                <motion.li
                  key={item}
                  variants={itemVariants}
                  whileHover={{ x: 5 }}
                  className="flex items-center gap-3"
                >
                  <span className="h-6 w-6 flex items-center justify-center rounded-full bg-autisync-gold/20 text-autisync-gold text-sm">
                    ✓
                  </span>
                  <span className="text-autisync-black text-base font-medium">
                    {item}
                  </span>
                </motion.li>
              ))}
            </motion.ul>
          </ScrollReveal>

          {/* RIGHT UI MOCKUP */}
          <ScrollReveal variant={slideInRight} delay={0.2}>
            <div className="relative rounded-[28px] bg-[#F2F4F7] p-6 shadow-xl">
              {/* FLOATING NOTIFICATION */}
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6, duration: 0.5 }}
                whileHover={{ scale: 1.05, y: -2 }}
                className="absolute -top-4 right-6 bg-white rounded-full px-4 py-2 shadow-md flex items-center gap-2 text-sm"
              >
                <motion.span
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  🔔
                </motion.span>
                <span className="font-medium">Mudança de turno</span>
                <span className="text-autisync-black/60">
                  Turno de terça movido para as 14:00
                </span>
              </motion.div>

              {/* MOCK CALENDAR */}
              <motion.div
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="grid grid-cols-[80px_1fr_1fr] gap-y-4 text-sm"
              >
                {[
                  ["6h", "Turno Manhã", "Turno Manhã"],
                  ["9h", "—", "—"],
                  ["12h", "Turno Cedo", "Turno Tarde"],
                  ["15h", "Turno Tarde", "Turno Manhã"],
                  ["18h", "Turno Tarde", "Turno Tarde"],
                ].map(([time, a, b], i) => (
                  <motion.div
                    key={time}
                    variants={itemVariants}
                    className="contents"
                  >
                    <div className="text-autisync-black/60">{time}</div>
                    <motion.div
                      whileHover={{ scale: 1.05, y: -2 }}
                      className="bg-blue-300/80 text-white rounded-lg py-2 px-3 text-center cursor-pointer"
                    >
                      {a}
                    </motion.div>
                    <motion.div
                      whileHover={{ scale: 1.05, y: -2 }}
                      className="bg-purple-400/80 text-white rounded-lg py-2 px-3 text-center cursor-pointer"
                    >
                      {b}
                    </motion.div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ===================== FEATURES ===================== */}
      <section
        className="py-28 px-6 bg-gradient-to-b from-[#FBF7EF] to-white"
        id="features"
      >
        <div className="max-w-7xl mx-auto">
          {/* Section header */}
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl text-center font-bold leading-tight mb-4">
              Criado para
              <br />
              trabalhadores por turnos.
            </h2>

            <p className="text-center text-lg text-autisync-black/60 mb-14">
              Tudo o que precisa para deixar de se preocupar com o seu horário.
            </p>
          </ScrollReveal>

          {/* Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid gap-10 md:grid-cols-3"
          >
            {[
              {
                title: "Acesso Instantâneo",
                desc: "Veja a sua escala em segundos, em qualquer lugar.",
                img: "/images/feature_instant.jpg",
                icon: "⚡",
              },
              {
                title: "Atualizações Automáticas",
                desc: "As alterações sincronizam em tempo real. Sem edições manuais.",
                img: "/images/feature_auto.jpg",
                icon: "🔄",
              },
              {
                title: "Sempre Consigo",
                desc: "Funciona offline. O seu horário está sempre disponível.",
                img: "/images/feature_offline.jpg",
                icon: "📱",
              },
              {
                title: "Partilha Fácil",
                desc: "Partilhe com família e colegas num toque.",
                img: "/images/feature_sharing.jpg",
                icon: "🔗",
              },
              {
                title: "Lembretes Inteligentes",
                desc: "Seja notificado antes dos turnos e trocas de última hora.",
                img: "/images/feature_reminders.jpg",
                icon: "🔔",
              },
              {
                title: "Zero Confusão",
                desc: "Uma única fonte de verdade. Sem capturas de ecrã perdidas.",
                img: "/images/feature_zero.jpg",
                icon: "✔️",
              },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                variants={itemVariants}
                whileHover={{ y: -8, scale: 1.02 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-[28px] shadow-lg overflow-hidden"
              >
                {/* Image */}
                <div className="h-44 w-full overflow-hidden">
                  <motion.img
                    whileHover={{ scale: 1.1 }}
                    transition={{ duration: 0.6 }}
                    src={f.img}
                    alt={f.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Content */}
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <motion.span
                      whileHover={{ rotate: 360, scale: 1.2 }}
                      transition={{ duration: 0.6 }}
                      className="h-10 w-10 flex items-center justify-center rounded-full bg-autisync-gold/15 text-autisync-gold text-xl cursor-pointer"
                    >
                      {f.icon}
                    </motion.span>
                    <h3 className="text-lg font-semibold">{f.title}</h3>
                  </div>

                  <p className="text-autisync-black/70 text-base leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl font-bold mb-12">
              How Shift<span className="text-autisync-gold">Sync</span> Works
            </h2>
          </ScrollReveal>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid gap-10 md:grid-cols-3"
          >
            {[
              {
                step: "1",
                title: "Inicie Sessão com Segurança",
                desc: "Autentique-se usando Google OAuth com segurança de nível empresarial.",
              },
              {
                step: "2",
                title: "Carregue o Ficheiro de Horário",
                desc: "Carregue o ficheiro para ser inserido no seu Calendário",
              },
              {
                step: "3",
                title: "Sincronize e Seja Pontual",
                desc: "Selecione o Calendário para criar/atualizar - Viva uma boa vida",
              },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                variants={itemVariants}
                whileHover={{ y: -5 }}
                className="p-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5, type: "spring" }}
                  className="text-autisync-gold text-4xl font-bold mb-4"
                >
                  {s.step}
                </motion.div>
                <h3 className="text-xl font-semibold mb-3">{s.title}</h3>
                <p className="text-autisync-black/70 text-base leading-relaxed">
                  {s.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===================== PRICING ===================== */}
      <section className="py-32 px-6 bg-[#FBF7EF]" id="pricing">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          {/* LEFT CONTENT */}
          <ScrollReveal variant={slideInLeft}>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Preços simples.
            </h2>

            <p className="text-lg md:text-xl text-autisync-black/70 mb-10 leading-relaxed">
              Comece grátis. Atualize apenas quando precisar de mais.
            </p>

            <motion.ul
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="space-y-4"
            >
              {[
                "Sincronização ilimitada de horários",
                "Atualizações em tempo real",
                "Lembretes inteligentes",
                "Partilhe com a família",
                "Acesso offline",
              ].map((item) => (
                <motion.li
                  key={item}
                  variants={itemVariants}
                  whileHover={{ x: 5 }}
                  className="flex items-center gap-3"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-autisync-gold/15 text-autisync-gold text-sm">
                    ✓
                  </span>
                  <span className="text-autisync-black/80 text-base font-medium">
                    {item}
                  </span>
                </motion.li>
              ))}
            </motion.ul>
          </ScrollReveal>

          {/* RIGHT CARD */}
          <ScrollReveal variant={slideInRight} delay={0.2}>
            <div className="relative">
              <motion.div
                whileHover={{ y: -8, scale: 1.02 }}
                transition={{ duration: 0.4 }}
                className="relative rounded-[32px] overflow-hidden shadow-xl"
              >
                {/* Image */}
                <motion.img
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.6 }}
                  src="/images/pricing_smile.jpg"
                  alt="ShiftSync pricing"
                  className="w-full h-[520px] object-cover"
                />

                {/* Overlay */}
                <div className="absolute inset-0 bg-black/30" />

                {/* Badge */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="absolute top-6 left-6 bg-white rounded-full px-6 py-3 shadow-md cursor-pointer"
                >
                  <p className="text-autisync-gold font-bold text-lg leading-none">
                    Grátis
                  </p>
                  <p className="text-sm text-autisync-black/60">
                    Durante a beta
                  </p>
                </motion.div>

                {/* CTA */}
                <motion.a
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  href="/home"
                  className="absolute top-6 right-6 bg-autisync-gold text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition"
                >
                  Começar →
                </motion.a>
              </motion.div>

              {/* Footer note */}
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 }}
                className="text-center text-xs text-autisync-black/50 mt-4"
              >
                Não é necessário cartão de crédito.
              </motion.p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="py-24 px-6 text-center">
        <ScrollReveal>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Pronto para deixar de se preocupar com o seu horário?
          </h2>
          <p className="text-lg md:text-xl text-autisync-black/70 mb-8 leading-relaxed">
            Junte-se à beta e obtenha acesso gratuito para sempre.
          </p>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link
              to="/home"
              className="inline-block px-8 py-4 bg-autisync-gold text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-shadow"
            >
              Começar Agora
            </Link>
          </motion.div>
        </ScrollReveal>
      </section>

      {/* ===================== SCROLL TO TOP BUTTON ===================== */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            whileHover={{ scale: 1.1, y: -2 }}
            whileTap={{ scale: 0.9 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 z-50 p-4 bg-autisync-gold text-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
            aria-label="Scroll to top"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ===================== FOOTER ===================== */}
      <Footer />
    </div>
  );
};

export default Landing;

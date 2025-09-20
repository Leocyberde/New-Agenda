import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@shared/schema";
import type { z } from "zod";
import MerchantSignupForm from "@/components/auth/merchant-signup-form";
import { Eye, EyeOff, Sparkles, Scissors, Heart } from "lucide-react";

type LoginData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    const unsubscribe = authService.subscribe((state) => {
      if (state.isAuthenticated) {
        // Let App.tsx handle role-based redirection
        setLocation("/");
      }
    });
    return unsubscribe;
  }, [setLocation]);

  const onSubmit = async (data: LoginData) => {
    setIsLoading(true);
    try {
      const result = await authService.login(data.email, data.password);

      if (result.success) {
        toast({
          title: "Login realizado com sucesso!",
          description: "Redirecionando para o painel...",
        });
        console.log("Login successful, user data:", result.user);
        if (result.user.role === "employee") {
          console.log("Redirecting to employee dashboard");
          setLocation("/employee-dashboard");
        } else if (result.user.role === "merchant") {
          console.log("Redirecting to merchant dashboard");
          setLocation("/merchant-dashboard");
        } else if (result.user.role === "client") {
          console.log("Redirecting to client dashboard");
          setLocation("/client-dashboard");
        } else {
          console.log("Redirecting to admin dashboard");
          setLocation("/dashboard");
        }
      } else {
        toast({
          title: "Erro no login",
          description: result.error || "Credenciais inválidas",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (showSignup) {
    return <MerchantSignupForm onBack={() => setShowSignup(false)} />;
  }

  return (
    <div className="min-h-screen relative overflow-hidden" data-testid="page-login">
      {/* Background with gradient and animated elements */}
      <div className="absolute inset-0 bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-100">
        {/* Animated floating elements */}
        <div className="absolute top-20 left-20 w-32 h-32 bg-pink-200/30 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-purple-200/30 rounded-full blur-lg animate-bounce"></div>
        <div className="absolute bottom-32 left-32 w-28 h-28 bg-indigo-200/30 rounded-full blur-xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 right-20 w-20 h-20 bg-pink-300/30 rounded-full blur-lg animate-bounce delay-500"></div>
        
        {/* Decorative icons */}
        <div className="absolute top-32 right-1/4 text-pink-300/40 animate-spin-slow">
          <Sparkles size={32} />
        </div>
        <div className="absolute bottom-1/3 left-1/4 text-purple-300/40 animate-pulse">
          <Scissors size={28} />
        </div>
        <div className="absolute top-1/2 right-16 text-indigo-300/40 animate-bounce">
          <Heart size={24} />
        </div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="backdrop-blur-lg bg-white/80 shadow-2xl border-0 rounded-3xl overflow-hidden">
            <CardContent className="p-0">
              {/* Header with gradient */}
              <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 p-8 text-center text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-black/10"></div>
                <div className="relative z-10">
                  <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <Scissors className="text-3xl text-white" size={32} />
                  </div>
                  <h1 className="text-3xl font-bold mb-2 tracking-tight">Agenda de Beleza</h1>
                  <p className="text-white/90 text-lg">Sistema de Agendamento Profissional</p>
                </div>
                
                {/* Decorative wave */}
                <div className="absolute bottom-0 left-0 right-0">
                  <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-8 fill-white/80">
                    <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z"></path>
                  </svg>
                </div>
              </div>

              {/* Form content */}
              <div className="p-8 space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-gray-800 mb-2">Bem-vindo de volta!</h2>
                  <p className="text-gray-600">Acesse sua conta para continuar</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" data-testid="form-login">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-700 font-medium">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      {...register("email")}
                      placeholder="seu@email.com"
                      disabled={isLoading}
                      data-testid="input-email"
                      className="h-12 rounded-xl border-gray-200 focus:border-purple-400 focus:ring-purple-400/20 transition-all duration-200"
                    />
                    {errors.email && (
                      <p className="text-sm text-red-500 flex items-center gap-1" data-testid="error-email">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-gray-700 font-medium">Senha</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        {...register("password")}
                        placeholder="Digite sua senha"
                        disabled={isLoading}
                        data-testid="input-password"
                        className="h-12 rounded-xl border-gray-200 focus:border-purple-400 focus:ring-purple-400/20 transition-all duration-200 pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-sm text-red-500 flex items-center gap-1" data-testid="error-password">
                        {errors.password.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="remember"
                        className="w-4 h-4 text-purple-500 border-gray-300 rounded focus:ring-purple-400 focus:ring-2"
                      />
                      <label htmlFor="remember" className="text-sm text-gray-600 select-none">
                        Lembrar-me
                      </label>
                    </div>
                    <a href="#" className="text-sm text-purple-600 hover:text-purple-800 font-medium transition-colors">
                      Esqueceu a senha?
                    </a>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-600 hover:via-purple-600 hover:to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]"
                    disabled={isLoading}
                    data-testid="button-login"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Entrando...
                      </div>
                    ) : (
                      "Entrar"
                    )}
                  </Button>
                </form>

                {/* Divisor */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-4 text-gray-500 font-medium">
                      Ou
                    </span>
                  </div>
                </div>

                {/* Botão de Cadastro */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 border-2 border-gray-200 hover:border-purple-300 hover:bg-purple-50 text-gray-700 font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02]"
                  onClick={() => setShowSignup(true)}
                  disabled={isLoading}
                >
                  <Sparkles className="mr-2" size={18} />
                  Cadastre seu Salão
                </Button>

                <div className="pt-4 text-center text-sm text-gray-500">
                  © 2024 Agenda de Beleza. Todos os direitos reservados.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>
    </div>
  );
}


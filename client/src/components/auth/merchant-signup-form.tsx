import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMerchantSchema } from "@shared/schema";
import { z } from "zod";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Crown, Gift } from "lucide-react";

type MerchantSignupData = z.infer<typeof insertMerchantSchema> & {
  planType: "trial" | "vip";
};

interface MerchantSignupFormProps {
  onBack: () => void;
}

export default function MerchantSignupForm({ onBack }: MerchantSignupFormProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [vipPrice, setVipPrice] = useState("50,00"); // Default value
  // Removed isRedirecting state that was blocking the redirect
  const [step, setStep] = useState<"info" | "plan" | "payment">("info");
  
  // PIX payment states
  const [pixData, setPixData] = useState<{
    payment_id?: string;
    qr_code?: string;
    qr_code_base64?: string;
    expires_at?: Date;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'approved' | 'failed'>('pending');
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);

  // Fetch VIP price from system settings
  useEffect(() => {
    const fetchVipPrice = async () => {
      try {
        const response = await fetch('/api/public/plan-pricing');
        if (response.ok) {
          const pricing = await response.json();
          setVipPrice(pricing.vipPrice.replace('.', ','));
        }
      } catch (error) {
        console.log("Could not fetch VIP price, using default");
      }
    };

    fetchVipPrice();
  }, []);

  // Create PIX payment
  const createPixPayment = async (email: string, amount: string) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/payment/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          merchantEmail: email, 
          amount: parseFloat(amount.replace(',', '.'))
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setPixData({
          payment_id: result.payment_id,
          qr_code: result.qr_code,
          qr_code_base64: result.qr_code_base64,
          expires_at: new Date(result.expires_at)
        });
        setPaymentStatus('processing');
        startPaymentStatusCheck(result.payment_id);
      } else {
        throw new Error(result.message || 'Erro ao criar pagamento PIX');
      }
    } catch (error) {
      console.error('Error creating PIX payment:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível gerar o PIX. Tente novamente.",
        variant: "destructive",
      });
      setPaymentStatus('failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Check payment status periodically
  const startPaymentStatusCheck = (paymentId: string) => {
    const checkInterval = setInterval(async () => {
      try {
        setIsCheckingPayment(true);
        const response = await fetch(`/api/payment/status/${paymentId}`);
        const result = await response.json();

        if (result.status === 'approved') {
          setPaymentStatus('approved');
          clearInterval(checkInterval);
          
          toast({
            title: "Pagamento Aprovado!",
            description: "Seu plano VIP foi ativado com sucesso.",
          });

          // Proceed with registration with VIP plan
          setTimeout(() => {
            handleSignup();
          }, 2000);
        } else if (result.status === 'rejected' || result.status === 'cancelled') {
          setPaymentStatus('failed');
          clearInterval(checkInterval);
          
          toast({
            title: "Pagamento não aprovado",
            description: "O pagamento foi rejeitado ou cancelado.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
      } finally {
        setIsCheckingPayment(false);
      }
    }, 3000); // Check every 3 seconds

    // Stop checking after 30 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      if (paymentStatus === 'processing') {
        setPaymentStatus('failed');
        toast({
          title: "Tempo Esgotado",
          description: "O tempo para pagamento expirou. Tente novamente.",
          variant: "destructive",
        });
      }
    }, 30 * 60 * 1000);
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<MerchantSignupData>({
    resolver: zodResolver(insertMerchantSchema.extend({
      planType: z.enum(["trial", "vip"]).default("trial"),
    })),
    defaultValues: {
      name: "",
      ownerName: "",
      email: "",
      password: "",
      phone: "",
      address: "",
      planType: "trial",
    },
  });

  const selectedPlan = watch("planType");

  const onSubmitInfo = () => {
    setStep("plan");
  };

  const onSubmitPlan = async () => {
    if (selectedPlan === "vip") {
      setStep("payment");
      // Auto-create PIX payment when going to payment step
      const formData = watch();
      if (formData.email) {
        await createPixPayment(formData.email, vipPrice);
      }
    } else {
      handleSignup();
    }
  };

  const handleSignup = async () => {
    setIsLoading(true);
    try {
      const formData = watch();
      console.log("Starting merchant registration for:", formData.email);
      
      // Call the merchant registration API endpoint
      const response = await fetch('/api/merchants/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      console.log("Registration response status:", response.status);

      if (response.ok) {
        console.log("Merchant registration successful, showing toast and redirecting...");
        
        toast({
          title: "Cadastro realizado com sucesso!",
          description: selectedPlan === "trial" 
            ? "Sua conta foi criada com 10 dias grátis! Redirecionando para o login..." 
            : "Conta criada! Aguarde a confirmação do pagamento. Redirecionando para o login...",
        });
        
        // Use setTimeout to ensure the toast is shown before redirect
        setTimeout(() => {
          console.log("About to redirect to /login with automatic page refresh");
          
          // Force navigation to login page with page refresh
          // This ensures the page state is completely reset
          window.location.replace("/login");
          
          // Fallback in case replace doesn't work
          setTimeout(() => {
            console.log("Using href fallback");
            window.location.href = "/login";
          }, 500);
        }, 2000); // 2 second delay to show the toast
      } else {
        console.log("Registration failed with status:", response.status);
        const error = await response.json();
        console.log("Registration error:", error);
        toast({
          title: "Erro no cadastro",
          description: error.message || "Tente novamente",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Network or connection error during registration:", error);
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderInfoStep = () => (
    <>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle>Cadastre seu Salão</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Salão *</Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="Salão Beauty"
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ownerName">Nome do Proprietário *</Label>
            <Input
              id="ownerName"
              {...register("ownerName")}
              placeholder="João Silva"
              disabled={isLoading}
            />
            {errors.ownerName && (
              <p className="text-sm text-destructive">{errors.ownerName.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            placeholder="joao@salaobeauty.com"
            disabled={isLoading}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha *</Label>
          <Input
            id="password"
            type="password"
            {...register("password")}
            placeholder="Mínimo 6 caracteres"
            disabled={isLoading}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Telefone *</Label>
          <Input
            id="phone"
            {...register("phone")}
            placeholder="(11) 99999-9999"
            disabled={isLoading}
          />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Endereço *</Label>
          <Input
            id="address"
            {...register("address")}
            placeholder="Rua das Flores, 123 - Centro"
            disabled={isLoading}
          />
          {errors.address && (
            <p className="text-sm text-destructive">{errors.address.message}</p>
          )}
        </div>

        <Button 
          type="button" 
          className="w-full"
          onClick={handleSubmit(onSubmitInfo)}
          disabled={isLoading}
        >
          Continuar
        </Button>
      </CardContent>
    </>
  );

  const renderPlanStep = () => (
    <>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStep("info")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle>Escolha seu Plano</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup 
          value={selectedPlan} 
          onValueChange={(value) => setValue("planType", value as "trial" | "vip")}
        >
          {/* Teste Grátis */}
          <div className="flex items-center space-x-3 border rounded-lg p-4 hover:bg-muted/50">
            <RadioGroupItem value="trial" id="trial" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-green-600" />
                <Label htmlFor="trial" className="font-medium">
                  Teste Grátis - 10 Dias
                </Label>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Recomendado
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Experimente todas as funcionalidades gratuitamente por 10 dias
              </p>
              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                <li>✓ Agenda de Belezamentos ilimitados</li>
                <li>✓ Cadastro de clientes</li>
                <li>✓ Controle de serviços</li>
                <li>✓ Relatórios básicos</li>
              </ul>
            </div>
          </div>

          {/* Plano VIP */}
          <div className="flex items-center space-x-3 border rounded-lg p-4 hover:bg-muted/50">
            <RadioGroupItem value="vip" id="vip" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-600" />
                <Label htmlFor="vip" className="font-medium">
                  Plano VIP - 30 Dias
                </Label>
                <Badge className="bg-amber-100 text-amber-800">
                  R$ {vipPrice}/mês
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Acesso completo com recursos avançados por 30 dias
              </p>
              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                <li>✓ Tudo do teste grátis</li>
                <li>✓ Relatórios avançados</li>
                <li>✓ Gestão de funcionários</li>
                <li>✓ Sistema de penalidades</li>
                <li>✓ Promoções personalizadas</li>
                <li>✓ Suporte prioritário</li>
              </ul>
            </div>
          </div>
        </RadioGroup>

        <Button 
          type="button" 
          className="w-full"
          onClick={onSubmitPlan}
          disabled={isLoading}
        >
          {selectedPlan === "vip" ? "Ir para Pagamento" : "Criar Conta Gratuita"}
        </Button>
      </CardContent>
    </>
  );

  const renderPaymentStep = () => (
    <>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStep("plan")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle>Pagamento - Plano VIP</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted/50 p-4 rounded-lg">
          <h3 className="font-medium mb-2">Resumo do Pedido</h3>
          <div className="flex justify-between">
            <span>Plano VIP - 30 dias</span>
            <span className="font-medium">R$ {vipPrice}</span>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-medium">Pagamento via PIX</h3>
          
          {paymentStatus === 'pending' && !pixData && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Gerando código PIX...
              </p>
              {isLoading && (
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
              )}
            </div>
          )}

          {paymentStatus === 'processing' && pixData && (
            <div className="space-y-4">
              <div className="text-center">
                <h4 className="font-medium mb-2">Escaneie o QR Code para pagar</h4>
                <div className="bg-white p-4 rounded-lg inline-block border">
                  <img 
                    src={`data:image/png;base64,${pixData.qr_code_base64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 mx-auto"
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Ou copie e cole o código PIX:
                </p>
                <div className="bg-muted p-2 rounded text-xs break-all mt-2">
                  {pixData.qr_code}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    if (pixData.qr_code) {
                      navigator.clipboard.writeText(pixData.qr_code);
                      toast({
                        title: "Código copiado!",
                        description: "O código PIX foi copiado para a área de transferência.",
                      });
                    }
                  }}
                >
                  📋 Copiar Código PIX
                </Button>
              </div>

              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2">
                  {isCheckingPayment && (
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                  )}
                  <span className="text-sm text-blue-600">
                    Aguardando pagamento...
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  O pagamento será verificado automaticamente
                </p>
              </div>
            </div>
          )}

          {paymentStatus === 'approved' && (
            <div className="text-center space-y-4">
              <div className="text-green-600">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">✓</span>
                </div>
                <h4 className="font-medium text-lg">Pagamento Aprovado!</h4>
                <p className="text-sm">Seu plano VIP foi ativado com sucesso.</p>
              </div>
            </div>
          )}

          {paymentStatus === 'failed' && (
            <div className="text-center space-y-4">
              <div className="text-red-600">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">✗</span>
                </div>
                <h4 className="font-medium text-lg">Pagamento Não Aprovado</h4>
                <p className="text-sm">Houve um problema com o pagamento.</p>
              </div>
              <Button 
                variant="outline"
                onClick={() => {
                  setPaymentStatus('pending');
                  setPixData(null);
                  const formData = watch();
                  if (formData.email) {
                    createPixPayment(formData.email, vipPrice);
                  }
                }}
              >
                Tentar Novamente
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {paymentStatus === 'approved' && (
            <Button 
              className="w-full"
              onClick={handleSignup}
              disabled={isLoading}
            >
              {isLoading ? "Finalizando..." : "Concluir Cadastro"}
            </Button>
          )}
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => {
              setValue("planType", "trial");
              setStep("plan");
              setPaymentStatus('pending');
              setPixData(null);
            }}
          >
            Voltar ao Teste Grátis
          </Button>
        </div>
      </CardContent>
    </>
  );

  // Removed isRedirecting render that was blocking the redirect

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <Card className="shadow-2xl border border-border">
          {step === "info" && renderInfoStep()}
          {step === "plan" && renderPlanStep()}
          {step === "payment" && renderPaymentStep()}
        </Card>
      </div>
    </div>
  );
}
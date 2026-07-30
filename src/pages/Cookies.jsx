import { Button } from "@/components/ui/button";
import LegalDocumentLayout, { LegalList, LegalSection } from "@/components/legal/LegalDocumentLayout";
import { COOKIE_POLICY_VERSION, openPrivacyPreferences } from "@/lib/privacy-preferences";

export default function Cookies() {
  return (
    <LegalDocumentLayout
      eyebrow="Tecnologias do navegador"
      title="Política de Cookies"
      summary="Esta política descreve os cookies e recursos de armazenamento local usados pelo sistema, suas finalidades e como alterar suas preferências."
      version={COOKIE_POLICY_VERSION}
    >
      <LegalSection title="1. O que são cookies e armazenamento local">
        <p>Cookies são pequenos registros armazenados pelo navegador. A aplicação também usa armazenamento local e de sessão para manter autenticação, segurança, contexto da unidade e preferências. Essas tecnologias não acessam arquivos pessoais do dispositivo.</p>
      </LegalSection>

      <LegalSection title="2. Recursos estritamente necessários">
        <LegalList>
          <li>Sessão de autenticação e renovação segura de acesso.</li>
          <li>Identificação do dispositivo, proteção contra abuso e recuperação de sessão.</li>
          <li>Unidade ativa e escopo de acesso selecionado.</li>
          <li>Registro da sua decisão de privacidade por até 180 dias.</li>
          <li>Dados temporários indispensáveis para abrir anexos ou concluir fluxos solicitados pelo próprio usuário.</li>
        </LegalList>
        <p>Esses recursos não podem ser desativados pelo painel porque a aplicação autenticada não funciona de forma segura sem eles. O navegador pode bloqueá-los, mas isso pode impedir login e funcionalidades essenciais.</p>
      </LegalSection>

      <LegalSection title="3. Cookies de preferência">
        <p>Com sua autorização, o cookie <strong>sidebar_state</strong> lembra por sete dias se a barra lateral estava aberta ou recolhida. Se a preferência for recusada ou revogada, esse cookie é removido.</p>
      </LegalSection>

      <LegalSection title="4. Analytics, publicidade e rastreamento">
        <p>Na versão atual, não utilizamos cookies próprios de publicidade, remarketing ou analytics comportamental. Se isso mudar, esta política e o painel de preferências serão atualizados antes da ativação.</p>
      </LegalSection>

      <LegalSection title="5. Como alterar sua escolha">
        <p>Você pode revisar a escolha a qualquer momento. A revogação não afeta o tratamento realizado anteriormente e passa a valer para usos futuros.</p>
        <Button type="button" variant="outline" className="rounded-xl" onClick={openPrivacyPreferences}>
          Abrir preferências de cookies
        </Button>
      </LegalSection>

      <LegalSection title="6. Controles do navegador">
        <p>Também é possível apagar ou bloquear cookies nas configurações do navegador. Ao apagar o armazenamento local, a sessão poderá ser encerrada e a aplicação voltará a solicitar suas preferências.</p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}

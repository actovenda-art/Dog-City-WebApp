import LegalDocumentLayout, { LegalList, LegalSection } from "@/components/legal/LegalDocumentLayout";
import { PRIVACY_NOTICE_VERSION, privacyContact } from "@/lib/privacy-preferences";

export default function Privacidade() {
  return (
    <LegalDocumentLayout
      eyebrow="Proteção de dados"
      title="Aviso de Privacidade"
      summary="Este aviso explica quais dados pessoais são tratados pela Dog City Brasil, para quais finalidades, com quem podem ser compartilhados e como o titular pode exercer seus direitos."
      version={PRIVACY_NOTICE_VERSION}
    >
      <LegalSection title="1. Quem trata os dados">
        <p>
          A unidade Dog City responsável pelo cadastro, atendimento, vínculo profissional ou operação financeira atua como controladora dos dados relacionados à sua atividade. A administração do sistema pode atuar conjuntamente nas decisões de segurança, governança e suporte.
        </p>
        <p>
          O nome da unidade responsável aparece no link de cadastro, no atendimento ou na interface autenticada. O canal de privacidade é {privacyContact.email || "o atendimento da unidade responsável pelo vínculo"}.
        </p>
      </LegalSection>

      <LegalSection title="2. Dados que podemos coletar">
        <LegalList>
          <li>Identificação e contato: nome, CPF/CNPJ, nascimento, telefone, email e endereço.</li>
          <li>Dados profissionais: função, unidade, perfis de acesso, jornada, registros de entrada e saída e dados para pagamento.</li>
          <li>Dados sensíveis informados no cadastro de funcionário: condições de saúde e uso de medicamento controlado, quando aplicável.</li>
          <li>Dados operacionais: responsáveis, cães vinculados, serviços, agenda, check-in, check-out, ocorrências, alimentação, cuidados e documentos anexados.</li>
          <li>Dados financeiros: orçamento, cobrança, carteira, pagamento, estorno, transação bancária, contraparte e identificadores de conciliação.</li>
          <li>Dados técnicos e de segurança: IP, navegador, dispositivo, sessão, logs de acesso, tentativas de autenticação e registros de auditoria.</li>
          <li>Dados enviados voluntariamente em formulários, anexos, observações e canais de atendimento.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="3. Como os dados são coletados">
        <p>Os dados são recebidos diretamente do titular ou de um responsável autorizado, de usuários internos, de links públicos protegidos e das integrações necessárias à operação, como autenticação, pagamentos, consulta de CEP e validação cadastral.</p>
      </LegalSection>

      <LegalSection title="4. Finalidades e bases legais">
        <LegalList>
          <li>Realizar cadastro, atendimento, orçamento, agendamento, prestação de serviços, cobrança, pagamento e suporte contratual ou pré-contratual.</li>
          <li>Cumprir obrigações legais, regulatórias, trabalhistas, fiscais, contábeis e de segurança.</li>
          <li>Proteger pessoas, animais, instalações, contas e transações; prevenir fraude e manter trilhas de auditoria.</li>
          <li>Exercer direitos em processos administrativos, judiciais ou arbitrais.</li>
          <li>Atender interesses legítimos de gestão, melhoria e segurança, após avaliação de necessidade e impacto aos titulares.</li>
          <li>Usar consentimento quando ele for exigido, especialmente para finalidades opcionais ou para dados sensíveis que não estejam amparados por outra base legal.</li>
        </LegalList>
        <p>O consentimento não é usado como justificativa genérica para todas as operações e pode ser revogado quando essa for a base legal aplicável.</p>
      </LegalSection>

      <LegalSection title="5. Compartilhamento e operadores">
        <p>Os dados são acessados apenas por pessoas autorizadas e podem ser compartilhados, no limite necessário, com:</p>
        <LegalList>
          <li>Supabase, para banco de dados, autenticação, armazenamento e funções de backend;</li>
          <li>Vercel, para hospedagem e entrega segura da interface;</li>
          <li>Banco Inter e futuros provedores financeiros aprovados, para emissão, consulta e conciliação de cobranças e transações;</li>
          <li>Google, quando o usuário escolhe autenticação Google ou acessa recursos externos vinculados;</li>
          <li>ViaCEP e serviços oficiais ou contratados de endereço, identidade e validação cadastral;</li>
          <li>provedores de email, comunicação e suporte necessários ao atendimento;</li>
          <li>profissionais envolvidos no atendimento, inclusive veterinários quando necessário;</li>
          <li>autoridades públicas, órgãos reguladores ou partes de processos, quando houver obrigação ou exercício regular de direitos.</li>
        </LegalList>
        <p>Não vendemos dados pessoais. Alguns fornecedores podem processar dados fora do Brasil; nesses casos, são adotadas medidas contratuais e técnicas compatíveis com a LGPD.</p>
      </LegalSection>

      <LegalSection title="6. Retenção e descarte">
        <p>Os dados são mantidos pelo período necessário para cumprir a finalidade informada, obrigações legais e regulatórias, prazos de defesa de direitos, segurança e prevenção a fraude. Encerrada a necessidade, os dados são eliminados, anonimizados ou mantidos de forma bloqueada quando houver fundamento legal.</p>
        <p>Pedidos de exclusão não alcançam registros que precisem ser preservados por obrigação legal, histórico financeiro, segurança ou exercício de direitos.</p>
      </LegalSection>

      <LegalSection title="7. Segurança">
        <p>Adotamos controles de acesso por perfil e unidade, autenticação, criptografia em trânsito, segregação de dados, URLs temporárias para arquivos privados, logs de segurança, auditoria e revisão de permissões. Nenhum ambiente é infalível; incidentes relevantes serão tratados conforme a legislação e os procedimentos aplicáveis.</p>
      </LegalSection>

      <LegalSection title="8. Direitos do titular">
        <p>O titular pode solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação quando cabível, portabilidade, informação sobre compartilhamento, revisão de decisões automatizadas, revogação do consentimento e oposição a tratamento irregular.</p>
        <p>Para proteger o titular, poderemos pedir validação de identidade. A resposta observará os prazos e limites legais. Também é possível peticionar perante a Autoridade Nacional de Proteção de Dados.</p>
      </LegalSection>

      <LegalSection title="9. Crianças, adolescentes e representantes">
        <p>Quando um cadastro envolver pessoa menor de idade, o tratamento deverá ser realizado no seu melhor interesse e com participação do responsável legal, conforme aplicável. Informações sobre cães e serviços podem estar vinculadas aos dados pessoais de seus responsáveis.</p>
      </LegalSection>

      <LegalSection title="10. Atualizações">
        <p>Este aviso pode ser atualizado por mudança legal, operacional ou tecnológica. Alterações relevantes serão destacadas na aplicação e uma nova versão será identificada pela data.</p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}

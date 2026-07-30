import LegalDocumentLayout, { LegalList, LegalSection } from "@/components/legal/LegalDocumentLayout";
import { TERMS_VERSION } from "@/lib/privacy-preferences";

export default function TermosUso() {
  return (
    <LegalDocumentLayout
      eyebrow="Condições de acesso"
      title="Termos de Uso"
      summary="Estes termos regulam o acesso ao sistema Dog City Brasil, aos links de cadastro e às páginas públicas de cobrança."
      version={TERMS_VERSION}
    >
      <LegalSection title="1. Aceitação e alcance">
        <p>Ao acessar ou utilizar o sistema, o usuário declara que leu estes termos e que usará os recursos somente para finalidades legítimas e autorizadas. Links públicos devem ser usados apenas pelo destinatário ou por pessoa autorizada.</p>
      </LegalSection>

      <LegalSection title="2. Contas e credenciais">
        <LegalList>
          <li>Credenciais, PINs, links e dispositivos de acesso são pessoais e não devem ser compartilhados.</li>
          <li>O usuário deve comunicar imediatamente suspeita de acesso indevido ou perda de controle da conta.</li>
          <li>Perfis e permissões são definidos conforme função e unidade; tentar contornar esses limites é proibido.</li>
          <li>A Dog City pode bloquear temporariamente o acesso para proteger contas, dados e operações.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="3. Informações fornecidas">
        <p>O usuário é responsável pela exatidão, atualização e legitimidade dos dados enviados. Quem preenche dados de terceiros declara possuir autorização ou outro fundamento válido para fazê-lo.</p>
      </LegalSection>

      <LegalSection title="4. Uso permitido">
        <p>É proibido usar a aplicação para fraude, assédio, violação de direitos, acesso não autorizado, engenharia reversa indevida, distribuição de código malicioso, sobrecarga intencional ou alteração de registros fora dos fluxos disponibilizados.</p>
      </LegalSection>

      <LegalSection title="5. Operações financeiras">
        <p>Orçamentos, cobranças, pagamentos, estornos e carteiras dependem das regras da unidade e de provedores financeiros. O usuário deve conferir beneficiário, valor, vencimento e situação antes de pagar. Um comprovante ou tela de consulta não substitui a confirmação bancária quando ela for necessária.</p>
      </LegalSection>

      <LegalSection title="6. Disponibilidade e terceiros">
        <p>A aplicação pode passar por manutenção ou sofrer indisponibilidades de rede e fornecedores. Integrações de autenticação, banco, mapas, email e outros serviços seguem também os termos de seus respectivos provedores.</p>
      </LegalSection>

      <LegalSection title="7. Propriedade intelectual">
        <p>Marcas, interfaces, textos, código e demais elementos do sistema pertencem aos seus titulares. O acesso não transfere propriedade nem autoriza reprodução, exploração ou distribuição fora das permissões concedidas.</p>
      </LegalSection>

      <LegalSection title="8. Responsabilidades">
        <p>Cada parte responde por seus atos, pelos dados que fornece e pelo uso que faz do sistema. Nenhuma disposição limita direitos que não possam ser afastados pela legislação brasileira.</p>
      </LegalSection>

      <LegalSection title="9. Privacidade">
        <p>O tratamento de dados pessoais é descrito no Aviso de Privacidade e na Política de Cookies, que integram estes termos.</p>
      </LegalSection>

      <LegalSection title="10. Alterações e legislação">
        <p>Os termos podem ser atualizados para refletir mudanças legais e operacionais. Aplica-se a legislação brasileira, preservados os direitos obrigatórios e o foro legalmente competente.</p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}

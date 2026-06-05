import { CarteiraConta } from "@/api/entities";

export async function ensureWalletAccountForFinancialProfile(carteira, empresaId = null) {
  if (!carteira?.id) return null;

  const resolvedEmpresaId = carteira?.empresa_id || empresaId || null;
  const queryResult = CarteiraConta.queryAll
    ? await CarteiraConta.queryAll({
      eq: {
        carteira_id: carteira.id,
        ...(resolvedEmpresaId ? { empresa_id: resolvedEmpresaId } : {}),
      },
      pageSize: 1,
      maxRows: 1,
      count: false,
    })
    : await CarteiraConta.filter({
      carteira_id: carteira.id,
      ...(resolvedEmpresaId ? { empresa_id: resolvedEmpresaId } : {}),
    }, "-created_date", 1);

  const existingRows = Array.isArray(queryResult?.data) ? queryResult.data : (queryResult || []);
  if (existingRows[0]) return existingRows[0];

  return CarteiraConta.create({
    empresa_id: resolvedEmpresaId,
    carteira_id: carteira.id,
    saldo_atual: 0,
    lock_version: 0,
    status: "ativa",
  });
}

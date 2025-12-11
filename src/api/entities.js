import { base44 } from './base44Client';


export const Dog = base44.entities.Dog;

export const Checkin = base44.entities.Checkin;

export const ServiceProvider = base44.entities.ServiceProvider;

export const Lancamento = base44.entities.Lancamento;

export const ExtratoBancario = base44.entities.ExtratoBancario;

export const ContaReceber = base44.entities.ContaReceber;

// alias Client (used across the app) if the SDK exposes it
export const Client = base44.entities.Client;

export const PedidoInterno = base44.entities.PedidoInterno;

export const Despesa = base44.entities.Despesa;

export const Responsavel = base44.entities.Responsavel;

export const Carteira = base44.entities.Carteira;

export const Notificacao = base44.entities.Notificacao;

export const Orcamento = base44.entities.Orcamento;

export const TabelaPrecos = base44.entities.TabelaPrecos;

export const Appointment = base44.entities.Appointment;

// `Schedule` is used in several pages; prefer a dedicated export but fall back to Appointment
export const Schedule = base44.entities.Schedule || base44.entities.Appointment;

export const ServiceProvided = base44.entities.ServiceProvided;

export const Transaction = base44.entities.Transaction;

export const ScheduledTransaction = base44.entities.ScheduledTransaction;

export const Replacement = base44.entities.Replacement;

export const PlanConfig = base44.entities.PlanConfig;

export const IntegracaoConfig = base44.entities.IntegracaoConfig;

export const Receita = base44.entities.Receita;



// auth sdk:
export const User = base44.auth;
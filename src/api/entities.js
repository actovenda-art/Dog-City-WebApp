import { appClient } from './appClient';


export const Dog = appClient.entities.Dog;

export const Checkin = appClient.entities.Checkin;

export const ServiceProvider = appClient.entities.ServiceProvider;

export const Lancamento = appClient.entities.Lancamento;

export const ExtratoBancario = appClient.entities.ExtratoBancario;

export const ContaReceber = appClient.entities.ContaReceber;

// alias Client (used across the app) if the SDK exposes it
export const Client = appClient.entities.Client;

export const PedidoInterno = appClient.entities.PedidoInterno;

export const Despesa = appClient.entities.Despesa;

export const Responsavel = appClient.entities.Responsavel;

export const Carteira = appClient.entities.Carteira;

export const Notificacao = appClient.entities.Notificacao;

export const Orcamento = appClient.entities.Orcamento;

export const TabelaPrecos = appClient.entities.TabelaPrecos;

export const Appointment = appClient.entities.Appointment;

// `Schedule` is used in several pages; prefer a dedicated export but fall back to Appointment
export const Schedule = appClient.entities.Schedule || appClient.entities.Appointment;

export const ServiceProvided = appClient.entities.ServiceProvided;

export const Transaction = appClient.entities.Transaction;

export const ScheduledTransaction = appClient.entities.ScheduledTransaction;

export const Replacement = appClient.entities.Replacement;

export const PlanConfig = appClient.entities.PlanConfig;

export const IntegracaoConfig = appClient.entities.IntegracaoConfig;

export const ExtratoDuplicidade = appClient.entities.ExtratoDuplicidade;

export const Receita = appClient.entities.Receita;

export const AppConfig = appClient.entities.AppConfig;

export const AppAsset = appClient.entities.AppAsset;

export const Empresa = appClient.entities.Empresa;

export const PerfilAcesso = appClient.entities.PerfilAcesso;

export const UserInvite = appClient.entities.UserInvite;

export const UserProfile = appClient.entities.UserProfile;



// auth sdk:
export const User = appClient.auth;

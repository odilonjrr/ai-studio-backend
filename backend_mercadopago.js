// ============================================================
// AI STUDIO - BACKEND MERCADOPAGO
// Node.js + Express (rodando em Vercel ou Heroku)
// ============================================================

const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Configurar MercadoPago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

// ============================================================
// ROTA 1: Criar preferência de pagamento
// ============================================================
app.post('/create_preference', async (req, res) => {
  try {
    const { title, quantity, price, currency_id, customer_email, customer_name } = req.body;

    const preference = {
      items: [
        {
          title: title,
          quantity: parseInt(quantity),
          currency_id: currency_id,
          unit_price: parseFloat(price)
        }
      ],
      payer: {
        email: customer_email || 'cliente@example.com',
        name: customer_name || 'Cliente'
      },
      // URLs de retorno
      back_urls: {
        success: process.env.SUCCESS_URL || 'https://seu-site.netlify.app?status=success',
        failure: process.env.FAILURE_URL || 'https://seu-site.netlify.app?status=failure',
        pending: process.env.PENDING_URL || 'https://seu-site.netlify.app?status=pending'
      },
      auto_return: 'approved',
      // Notificações (webhooks)
      notification_url: process.env.WEBHOOK_URL || 'https://seu-backend.vercel.app/webhook'
    };

    const response = await mercadopago.preferences.create(preference);

    res.status(200).json({
      init_point: response.body.init_point,
      preference_id: response.body.id
    });
  } catch (error) {
    console.error('Erro ao criar preferência:', error);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

// ============================================================
// ROTA 2: Webhook (receber notificações de pagamento)
// ============================================================
app.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.query;

    if (type === 'payment') {
      const paymentId = data.id;
      
      const payment = await mercadopago.payment.findById(paymentId);
      const paymentData = payment.body;

      console.log('Pagamento recebido:', paymentData);

      if (paymentData.status === 'approved') {
        await salvarPedidoAprovado(paymentData);
        await enviarEmailConfirmacao(paymentData);
      } else if (paymentData.status === 'pending') {
        await salvarPedidoPendente(paymentData);
      } else if (paymentData.status === 'rejected') {
        await notificarErro(paymentData);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

// ============================================================
// ROTA 3: Verificar status de pagamento (opcional)
// ============================================================
app.get('/payment/:id', async (req, res) => {
  try {
    const payment = await mercadopago.payment.findById(req.params.id);
    res.status(200).json(payment.body);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar pagamento' });
  }
});

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

async function salvarPedidoAprovado(paymentData) {
  const pedido = {
    id: paymentData.id,
    mercadopago_id: paymentData.id,
    cliente: paymentData.payer.email,
    valor: paymentData.transaction_amount,
    status: 'approved',
    data: new Date(),
    metodo_pagamento: paymentData.payment_method_id
  };

  console.log('Pedido salvo:', pedido);
  return pedido;
}

async function salvarPedidoPendente(paymentData) {
  const pedido = {
    id: paymentData.id,
    mercadopago_id: paymentData.id,
    cliente: paymentData.payer.email,
    valor: paymentData.transaction_amount,
    status: 'pending',
    data: new Date(),
    metodo_pagamento: paymentData.payment_method_id
  };

  console.log('Pedido pendente:', pedido);
  return pedido;
}

async function enviarEmailConfirmacao(paymentData) {
  const email = paymentData.payer.email;
  const valor = paymentData.transaction_amount;
  const metodo = paymentData.payment_method_id;

  const html = `
    <h2>Pagamento Confirmado! ✅</h2>
    <p>Seu pagamento foi processado com sucesso!</p>
    <p><strong>Valor:</strong> R$ ${valor.toFixed(2)}</p>
    <p><strong>Método:</strong> ${metodo}</p>
    <p><strong>ID do Pedido:</strong> ${paymentData.id}</p>
    <p>Você receberá suas fotos em até 5 dias úteis.</p>
  `;

  console.log('Email enviado para:', email);
}

async function notificarErro(paymentData) {
  console.error('Pagamento recusado:', paymentData);
}

// ============================================================
// INICIAR SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

module.exports = app;

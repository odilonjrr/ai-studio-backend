const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
require('dotenv').config();

const app = express();

app.use(express.json());

// CORS configurado para aceitar requisições de qualquer origem
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Configurar MercadoPago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

// ROTA: Criar preferência de pagamento
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
      back_urls: {
        success: process.env.SUCCESS_URL || 'https://seu-site.vercel.app?status=success',
        failure: process.env.FAILURE_URL || 'https://seu-site.vercel.app?status=failure',
        pending: process.env.PENDING_URL || 'https://seu-site.vercel.app?status=pending'
      },
      auto_return: 'approved',
      notification_url: process.env.WEBHOOK_URL || 'https://seu-backend.vercel.app/webhook'
    };

    const response = await mercadopago.preferences.create(preference);

    res.status(200).json({
      init_point: response.body.init_point,
      preference_id: response.body.id
    });
  } catch (error) {
    console.error('Erro ao criar preferência:', error);
    res.status(500).json({ error: 'Erro ao processar pagamento', details: error.message });
  }
});

// ROTA: Webhook
app.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.query;

    if (type === 'payment') {
      const paymentId = data.id;
      const payment = await mercadopago.payment.findById(paymentId);
      const paymentData = payment.body;

      console.log('Pagamento recebido:', paymentData);

      if (paymentData.status === 'approved') {
        console.log('Pedido aprovado:', paymentData.id);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

// ROTA: Verificar pagamento
app.get('/payment/:id', async (req, res) => {
  try {
    const payment = await mercadopago.payment.findById(req.params.id);
    res.status(200).json(payment.body);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar pagamento' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

module.exports = app;

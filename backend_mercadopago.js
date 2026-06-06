const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ROTA: Criar preferência de pagamento + salvar pedido no Supabase
app.post('/create_preference', async (req, res) => {
  try {
    const { title, quantity, price, currency_id, customer_email, customer_name, tema } = req.body;

    // 1. Criar preferência no MercadoPago
    const preference = {
      items: [{ title, quantity: parseInt(quantity), currency_id, unit_price: parseFloat(price) }],
      payer: { email: customer_email, name: customer_name },
      back_urls: {
        success: `${process.env.FRONTEND_URL}?status=success`,
        failure: `${process.env.FRONTEND_URL}?status=failure`,
        pending: `${process.env.FRONTEND_URL}?status=pending`
      },
      auto_return: 'approved',
      notification_url: `${process.env.BACKEND_URL}/webhook`
    };

    const mpResponse = await axios.post(
      'https://api.mercadopago.com/checkout/preferences',
      preference,
      { headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );

    const preferenceId = mpResponse.data.id;
    const initPoint = mpResponse.data.init_point;

    // 2. Salvar pedido no Supabase
    const { data, error } = await supabase
      .from('pedidos')
      .insert([{
        nome: customer_name,
        email: customer_email,
        tema: tema || title,
        quantidade: parseInt(quantity),
        valor: parseFloat(price),
        status: 'pendente',
        preference_id: preferenceId
      }])
      .select()
      .single();

    if (error) console.error('Erro Supabase:', error);

    res.json({ init_point: initPoint, preference_id: preferenceId, pedido_id: data?.id });

  } catch (error) {
    console.error('Erro:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao processar pagamento', details: error.message });
  }
});

// ROTA: Webhook do MercadoPago
app.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.query;

    if (type === 'payment' && data?.id) {
      const paymentResponse = await axios.get(
        `https://api.mercadopago.com/v1/payments/${data.id}`,
        { headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` } }
      );

      const payment = paymentResponse.data;
      const preferenceId = payment.order?.id || payment.preference_id;

      let status = 'pendente';
      if (payment.status === 'approved') status = 'aprovado';
      else if (payment.status === 'rejected') status = 'recusado';
      else if (payment.status === 'pending') status = 'pendente';

      // Atualizar status no Supabase
      const { error } = await supabase
        .from('pedidos')
        .update({ status, payment_id: String(data.id), updated_at: new Date().toISOString() })
        .eq('preference_id', preferenceId);

      if (error) console.error('Erro ao atualizar Supabase:', error);
      else console.log(`✅ Pedido ${preferenceId} atualizado para: ${status}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro webhook:', error.message);
    res.status(500).json({ error: 'Erro no webhook' });
  }
});

// ROTA: Buscar todos os pedidos (para o admin)
app.get('/pedidos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ROTA: Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', supabase: !!SUPABASE_URL, mp: !!MP_ACCESS_TOKEN });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`✅ Supabase: ${SUPABASE_URL ? 'configurado' : 'FALTA CONFIGURAR'}`);
  console.log(`✅ MercadoPago: ${MP_ACCESS_TOKEN ? 'configurado' : 'FALTA CONFIGURAR'}`);
});

module.exports = app;

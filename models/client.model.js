const { supabase } = require('../config/database');

const ClientModel = {
  async findAll() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('is_active', true)
      .order('client_name');
    if (error) throw new Error(error.message);
    return data;
  },

  async findByNameAndAddress(clientName, address, excludeId) {
    const normalizedName = String(clientName || '').trim().toLowerCase();
    const normalizedAddress = String(address || '').trim().toLowerCase();
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('is_active', true)
      .order('client_name');
    if (error) throw new Error(error.message);

    return (data || []).find((client) => {
      if (excludeId && client.id === excludeId) return false;
      return String(client.client_name || '').trim().toLowerCase() === normalizedName &&
        String(client.address || '').trim().toLowerCase() === normalizedAddress;
    }) || null;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    return data;
  },

  async create(data) {
    const { data: row, error } = await supabase
      .from('clients')
      .insert({
        client_name: data.client_name,
        abbreviation: data.abbreviation || null,
        contact_person: data.contact_person || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        industry: data.industry || null,
        leaves_allowed: Number(data.leaves_allowed || 0),
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return row.id;
  },

  async update(id, data) {
    const { error } = await supabase
      .from('clients')
      .update({
        client_name: data.client_name,
        abbreviation: data.abbreviation || null,
        contact_person: data.contact_person || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        industry: data.industry || null,
        leaves_allowed: Number(data.leaves_allowed || 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async softDelete(id) {
    const { error } = await supabase
      .from('clients')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};

module.exports = ClientModel;

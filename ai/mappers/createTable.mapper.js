export function mapTableToCreateTableArgs(table, context) {
  return {
    app_id: context.project_id,      // или app_id, если у вас так называется
    label: table.label,
    slug: table.slug,
    attributes: table.attributes,

    // дефолты backend
    show_in_menu: true,
    is_cached: false,
    soft_delete: false,
    order_by: false,

    // ключ
    x_api_key: context.x_api_key
  };
}

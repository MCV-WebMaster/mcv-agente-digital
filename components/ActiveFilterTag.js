export default function ActiveFilterTag({ label, onRemove }) {
  return (
    <div className="flex items-center bg-mcv-azul text-white text-sm font-medium pl-3 pr-2 py-1 rounded-full">
      <span>{label}</span>
      <button
        onClick={onRemove}
        className="ml-2 text-white opacity-70 hover:opacity-100"
        title="Quitar filtro"
      >
        &times;
      </button>
    </div>
  );
}
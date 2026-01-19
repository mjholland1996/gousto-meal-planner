import Link from 'next/link';
import { notFound } from 'next/navigation';
import fs from 'fs';
import path from 'path';

interface Receta {
  title: string;
  slug: string;
  ingredientes?: string;
  metodo?: string;
  content?: string;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getReceta(slug: string): Promise<Receta | null> {
  const filePath = path.join(process.cwd(), 'data', 'recetas', `${slug}.json`);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Receta;
  } catch {
    return null;
  }
}

export default async function RecetaPage({ params }: PageProps) {
  const { slug } = await params;
  const receta = await getReceta(slug);

  if (!receta) {
    notFound();
  }

  const hasSeparation = receta.ingredientes && receta.metodo;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link href="/recetas" className="text-amber-600 hover:text-amber-700 text-sm font-medium">
            &larr; Volver a recetas
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">{receta.title}</h1>

          {hasSeparation ? (
            <div className="space-y-6">
              {/* Ingredientes */}
              <section>
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Ingredientes</h2>
                <ul className="space-y-1">
                  {receta.ingredientes!.split('\n').map((line, index) => (
                    <li key={index} className="text-gray-700 flex items-start">
                      <span className="text-amber-500 mr-2">•</span>
                      {line}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Método */}
              <section>
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Método</h2>
                <div className="prose prose-gray max-w-none">
                  {receta.metodo!.split('\n\n').map((paragraph, index) => (
                    <p key={index} className="text-gray-700 mb-4">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            /* Fallback for recipes without clear separation */
            <div className="prose prose-gray max-w-none">
              {receta.content!.split('\n').map((line, index) => (
                <p key={index} className={line.trim() === '' ? 'h-4' : 'text-gray-700'}>
                  {line || '\u00A0'}
                </p>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";

interface BreadcrumbProps {
  pageName: string;
  parent?: { name: string; href: string };
}

const Breadcrumb = ({ pageName, parent }: BreadcrumbProps) => {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="font-display text-[28px] font-extrabold leading-[34px] tracking-tight text-dark dark:text-white">
        {pageName}
      </h2>

      <nav>
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link className="font-medium" href="/painel">
              Início /
            </Link>
          </li>
          {parent && (
            <li>
              <Link className="font-medium" href={parent.href}>
                {parent.name} /
              </Link>
            </li>
          )}
          <li className="font-medium text-primary">{pageName}</li>
        </ol>
      </nav>
    </div>
  );
};

export default Breadcrumb;

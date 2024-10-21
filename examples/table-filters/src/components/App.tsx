import { observer } from "mobx-react";
import { useQuery } from "mst-query";
import { useEffect } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { useRootStore } from "../context";
import { CompanyModelType } from "../models/models";

const Sidebar = observer(({ items }: { items: CompanyModelType[] }) => {
  const { companyId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!companyId && items.length) {
      navigate(`/company/${items[0].id}`);
    }
  }, [companyId, items, navigate]);

  return (
    <div>
      {items.map((item: any) => (
        <div key={item.id}>
          <Link to={`company/${item.id}`}>{item.name}</Link>
        </div>
      ))}
    </div>
  );
});

const MainScreen = observer(
  ({ companies }: { companies: CompanyModelType[] }) => {
    return (
      <div className="app-container">
        <div className="app-sidebar">
          <Sidebar items={companies} />
        </div>
        <div className="app-list">
          <Outlet />
        </div>
      </div>
    );
  },
);

export const App = observer(() => {
  const rootStore = useRootStore();
  const { data } = useQuery(rootStore.baseQuery);
  if (!data) {
    return <div>Loading app...</div>;
  }
  return <MainScreen companies={data} />;
});

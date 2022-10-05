import { observer } from 'mobx-react';
import { useQuery } from 'mst-query';
import { Link, Outlet } from 'react-router-dom';
import { useRootStore } from '../context';
import { CompanyModelType } from '../models/models';

const Sidebar = observer(({ items }: { items: { name: string }[] }) => {
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

const MainScreen = observer(({ companies }: { companies: CompanyModelType[] }) => {
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
});

export const App = observer(() => {
    const rootStore = useRootStore();
    const { data } = useQuery(rootStore.baseQuery, rootStore.getBase);
    if (!data) {
        return <div>Loading app...</div>;
    }
    return <MainScreen companies={data} />;
});

